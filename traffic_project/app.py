from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import tensorflow as tf
import numpy as np
import joblib

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# Load Google AI model
model = None
scaler = None

def load_model():
    global model, scaler
    if model is None:
        model = tf.keras.models.load_model("traffic_lstm_model (2).keras")
        scaler = joblib.load("scaler.save")

labels = ["LOW", "MEDIUM", "HIGH"]

def predict_one_road(hour, day, speed, vehicles):
    load_model()
    x = scaler.transform([[hour, day, speed, vehicles]])
    x = x.reshape((1, 1, 4))
    prediction = model.predict(x)
    return int(prediction.argmax())

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
    load_model()
    x = scaler.transform([[ 
        data["hour"],
        data["day"],
        data["speed"],
        data["vehicles"]
    ]])

    x = x.reshape((1,1,4))
    prediction = labels[np.argmax(model.predict(x))]

    return {"prediction": prediction}

@app.post("/predict-route")
def predict_route_api(data: dict):
    routes = data["routes"]

    results = {}

    for route_name in routes:
        congestion = predict_one_route(routes[route_name])
        results[route_name] = congestion

    # db.predictions.insert_one(results)

    return results

if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
