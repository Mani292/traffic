import requests
import json

url = "http://127.0.0.1:5000/predict-route"

data = {
    "routes": {
        "Route A": [
            {"hour":10,"day":2,"speed":35,"vehicles":150},
            {"hour":10,"day":2,"speed":30,"vehicles":180}
        ],
        "Route B": [
            {"hour":10,"day":2,"speed":20,"vehicles":300},
            {"hour":10,"day":2,"speed":18,"vehicles":350}
        ]
    }
}

response = requests.post(url, json=data)
print(response.json())
