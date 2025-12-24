from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import tensorflow as tf
import numpy as np
import joblib
import logging
import re

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load Google AI model
model = None
scaler = None

def load_model():
    global model, scaler
    if model is None:
        try:
            logger.info("Loading model and scaler...")
            model = tf.keras.models.load_model("traffic_lstm_model (2).keras")
            scaler = joblib.load("scaler.save")
            if scaler is None:
                raise ValueError("Scaler failed to load.")
            logger.info("Model and scaler loaded successfully.")
        except Exception as e:
            logger.error(f"Error loading model or scaler: {e}")
            raise

labels = ["LOW", "MEDIUM", "HIGH"]

def predict_one_road(hour, day, speed, vehicles):
    load_model()
    x = scaler.transform([[hour, day, speed, vehicles]])
    x = x.reshape((1, 1, 4))
    prediction = model.predict(x)
    logger.info(f"Raw probabilities: {prediction}")  # Log raw probabilities for debugging
    return prediction.tolist()  # Return the full prediction probabilities

def predict_one_route(roads):
    total = 0

    for road in roads:
        total += predict_one_road(
            road["hour"],
            road["day"],
            road["speed"],
            road["vehicles"]
        )

    avg = total / len(roads)

    if avg < 0.7:
        return "LOW"
    elif avg < 1.4:
        return "MEDIUM"
    else:
        return "HIGH"

# MongoDB connection
# client = MongoClient("mongodb://localhost:27017/")
# db = client.trafficDB

labels = ["LOW", "MEDIUM", "HIGH"]

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/predict")
def predict(data: dict):
    try:
        load_model()
        if scaler is None:
            raise ValueError("Scaler is not initialized.")

        x = scaler.transform([[ 
            data["hour"],
            data["day"],
            data["speed"],
            data["vehicles"]
        ]])

        x = x.reshape((1,1,4))
        prediction = labels[np.argmax(model.predict(x))]

        return {"prediction": prediction}
    except Exception as e:
        logger.error(f"Error in prediction: {e}")
        return {"error": str(e)}

@app.post("/predict-route")
def predict_route_api(data: dict):
    routes = data["routes"]

    results = {}

    for route_name in routes:
        congestion = predict_one_route(routes[route_name])
        results[route_name] = congestion

    # db.predictions.insert_one(results)

    return results

# Function to validate if a place name is from India
def is_place_from_india(place_name):
    # List of common Indian states and cities for validation
    indian_places = [
        "Delhi", "Mumbai", "Chennai", "Kolkata", "Bangalore", "Hyderabad", "Pune", "Ahmedabad", "Jaipur", "Lucknow", "Patna", "Indore", "Bhopal", "Nagpur", "Surat", "Kanpur", "Thane", "Agra", "Varanasi", "Amritsar", "Guwahati", "Ranchi", "Raipur", "Chandigarh", "Coimbatore", "Mysore", "Vadodara", "Jodhpur", "Madurai", "Nashik", "Aurangabad"
    ]
    return any(re.search(rf"\b{place}\b", place_name, re.IGNORECASE) for place in indian_places)

@app.post("/predict-route-details")
def predict_route_details(data: dict):
    try:
        load_model()
        if scaler is None:
            raise ValueError("Scaler is not initialized.")

        routes = data.get("routes", {})
        if not routes:
            raise ValueError("No routes provided in the input data.")

        results = {}

        for route_name, roads in routes.items():
            # Validate place names
            if not is_place_from_india(route_name):
                return {"error": f"Please enter the names of places from India only. Invalid place: {route_name}"}

            route_predictions = []
            total_time = 0

            for road in roads:
                try:
                    prediction_probs = predict_one_road(
                        road["hour"],
                        road["day"],
                        road["speed"],
                        road["vehicles"]
                    )
                    prediction_label = labels[prediction_probs[0].index(max(prediction_probs[0]))]  # Dynamically select the highest probability
                    prediction_details = {
                        "road": road,
                        "predictions": {
                            "LOW": prediction_probs[0][0],
                            "MEDIUM": prediction_probs[0][1],
                            "HIGH": prediction_probs[0][2]
                        },
                        "predicted_label": prediction_label
                    }
                    route_predictions.append(prediction_details)
                    total_time += road.get("time", 0)
                except Exception as e:
                    logger.error(f"Error predicting road in route {route_name}: {e}")
                    route_predictions.append({
                        "road": road,
                        "predictions": "Error"
                    })

            overall_prediction = predict_one_route(roads)
            results[route_name] = {
                "individual_predictions": route_predictions,
                "overall_prediction": labels[overall_prediction],
                "total_time": total_time
            }

        return {"route_details": results}
    except Exception as e:
        logger.error(f"Error in route prediction: {e}")
        return {"error": str(e)}

@app.post("/available-routes")
def available_routes(data: dict):
    try:
        routes = data.get("routes", {})
        if not routes:
            raise ValueError("No routes provided in the input data.")

        route_details = {}

        for route_name, roads in routes.items():
            total_time = sum(road.get("time", 0) for road in roads)
            route_details[route_name] = {
                "total_time": total_time,
                "number_of_roads": len(roads)
            }

        return {"available_routes": route_details}
    except Exception as e:
        logger.error(f"Error in fetching available routes: {e}")
        return {"error": str(e)}

@app.post("/optimal-route")
def optimal_route(data: dict):
    try:
        routes = data.get("routes", {})
        if not routes:
            raise ValueError("No routes provided in the input data.")

        route_details = {}
        optimal_route_name = None
        minimal_time = float("inf")

        for route_name, roads in routes.items():
            total_time = sum(road.get("time", 0) for road in roads)
            route_details[route_name] = {
                "total_time": total_time,
                "number_of_roads": len(roads),
                "roads": roads
            }

            if total_time < minimal_time:
                minimal_time = total_time
                optimal_route_name = route_name

        return {
            "route_details": route_details,
            "optimal_route": {
                "name": optimal_route_name,
                "total_time": minimal_time,
                "info": route_details[optimal_route_name]
            }
        }
    except Exception as e:
        logger.error(f"Error in fetching optimal route: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
