let map = null;

function predict() {
  console.log("Predict button clicked");
  fetch("/predict-route", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      "routes": {
        "Route A": [
          {"hour":10,"day":2,"speed":35,"vehicles":150}
        ],
        "Route B": [
          {"hour":10,"day":2,"speed":20,"vehicles":260}
        ]
      }
    })
  })
  .then(r => {
    console.log("Response received", r);
    return r.json();
  })
  .then(d => {
    console.log("Data", d);
    displayResults(d);
    drawRoutes(d);
  })
  .catch(e => console.error("Error", e));
}

function predictFuture() {
  console.log("Predict Future button clicked");
  const futureData = {
    "routes": {
      "Route A": [
        {"hour":10.5,"day":2,"speed":35,"vehicles":150}
      ],
      "Route B": [
        {"hour":10.5,"day":2,"speed":20,"vehicles":260}
      ]
    }
  };
  fetch("/predict-route", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(futureData)
  })
  .then(r => {
    console.log("Future response", r);
    return r.json();
  })
  .then(d => {
    console.log("Future data", d);
    displayResults(d, true);
    drawRoutes(d);
  })
  .catch(e => console.error("Future error", e));
}

function initMap() {
  console.log("Initializing map...");
  if (typeof L !== 'undefined') {
    map = L.map('map').setView([20.5937, 78.9629], 5); // Center of India
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    document.getElementById('map-loading').style.display = 'none';
    console.log("Map initialized.");
  } else {
    console.error("Leaflet not loaded.");
  }
}

function drawRoutes(data) {
  // Clear existing layers
  map.eachLayer(function(layer) {
    if (layer instanceof L.Polyline) {
      map.removeLayer(layer);
    }
  });

  // Example coordinates for Indian routes (Mumbai area)
  const routes = {
    "Route A": [
      [19.0760, 72.8777], // Mumbai
      [18.5204, 73.8567]  // Pune
    ],
    "Route B": [
      [19.0760, 72.8777], // Mumbai
      [19.2183, 72.9781]  // Thane
    ]
  };

  for (let route in data) {
    let color = data[route] === "LOW" ? "green" : data[route] === "MEDIUM" ? "orange" : "red";
    let polyline = L.polyline(routes[route], {color: color, weight: 5}).addTo(map);
  }
}

let currentRoute = null;

async function geocode(location) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location + ', India')}&limit=1`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(`Geocoding "${location}":`, data);
  if (data.length > 0) {
    const coord = [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    console.log("Coords:", coord);
    return coord;
  }
  throw new Error('Geocoding failed for ' + location);
}

async function getRouteOSRM(startCoord, endCoord) {
  const url = `https://router.project-osrm.org/route/v1/driving/${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.routes && data.routes.length > 0) {
    const route = data.routes[0];
    return {
      coords: route.geometry.coordinates.map(coord => [coord[1], coord[0]]), // [lat, lon]
      steps: route.legs[0].steps
    };
  }
  throw new Error('No route found');
}

function getRoute() {
  const start = document.getElementById("start").value;
  const dest = document.getElementById("dest").value;
  const hour = parseInt(document.getElementById("hour").value);
  const day = parseInt(document.getElementById("day").value);
  const speed = parseInt(document.getElementById("speed").value);
  const vehicles = parseInt(document.getElementById("vehicles").value);

  if (!start || !dest || isNaN(hour) || isNaN(day) || isNaN(speed) || isNaN(vehicles)) {
    alert("Please fill all fields");
    return;
  }

  console.log("Getting route...");
  document.getElementById("route-loading").style.display = "block";

  Promise.all([geocode(start), geocode(dest)])
    .then(([startCoord, endCoord]) => {
      return getRouteOSRM(startCoord, endCoord).then(routeData => ({ routeData, startCoord, endCoord }));
    })
    .then(({ routeData, startCoord, endCoord }) => {
      document.getElementById("route-loading").style.display = "none";
      currentRoute = routeData.coords;
      drawRouteOnMap(routeData.coords, startCoord, endCoord);
      displayDirections(routeData.steps);
      document.getElementById("route-info").textContent = `Route from ${start} to ${dest} loaded.`;
      predictForRoute(hour, day, speed, vehicles);
    })
    .catch(e => {
      document.getElementById("route-loading").style.display = "none";
      console.error("Route error", e);
      alert("Error getting route: " + e.message);
    });
}

function drawRouteOnMap(routeCoords, startCoord, endCoord) {
  if (!map) {
    console.error("Map not initialized");
    return;
  }
  // Clear existing layers
  map.eachLayer(function(layer) {
    if (layer instanceof L.Polyline || layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });

  if (routeCoords.length > 1) {
    let polyline = L.polyline(routeCoords, {color: "blue", weight: 5}).addTo(map);
    map.fitBounds(polyline.getBounds());

    // Add markers
    L.marker([startCoord[1], startCoord[0]]).addTo(map).bindPopup("Start");
    L.marker([endCoord[1], endCoord[0]]).addTo(map).bindPopup("End");
  }
}

function displayDirections(steps) {
  const directionsDiv = document.getElementById("route-info");
  let html = "<h3>Directions</h3><ol>";
  steps.forEach(step => {
    html += `<li>${step.maneuver.instruction} (${(step.distance / 1000).toFixed(1)} km)</li>`;
  });
  html += "</ol>";
  directionsDiv.innerHTML += html;
}

// Client-side traffic prediction based on input parameters
function calculateTrafficLevel(hour, day, speed, vehicles) {
  // Traffic prediction algorithm based on typical patterns
  // Factors: hour of day, day of week, average speed, vehicle count

  let score = 0;

  // Hour factor: Rush hours (7-10 AM, 5-8 PM) increase traffic
  if ((hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20)) {
    score += 30;
  } else if (hour >= 11 && hour <= 16) {
    score += 15; // Moderate daytime traffic
  } else {
    score += 5; // Low night/early morning traffic
  }

  // Day factor: Weekdays (1-5) have more traffic than weekends (6-7)
  if (day >= 1 && day <= 5) {
    score += 20;
  } else {
    score += 10;
  }

  // Speed factor: Lower speed indicates more congestion
  if (speed < 20) {
    score += 35;
  } else if (speed < 35) {
    score += 25;
  } else if (speed < 50) {
    score += 15;
  } else {
    score += 5;
  }

  // Vehicle count factor
  if (vehicles > 200) {
    score += 30;
  } else if (vehicles > 100) {
    score += 20;
  } else if (vehicles > 50) {
    score += 10;
  } else {
    score += 5;
  }

  // Determine traffic level based on total score
  if (score >= 80) {
    return "HIGH";
  } else if (score >= 50) {
    return "MEDIUM";
  } else {
    return "LOW";
  }
}

function predictForRoute(hour, day, speed, vehicles) {
  console.log("Predicting traffic...");

  // Use client-side prediction
  const level = calculateTrafficLevel(hour, day, speed, vehicles);
  console.log("Prediction result:", level);

  // Display prediction with color-coded indicator
  let colorClass, emoji, bgColor;
  if (level === "LOW") {
    colorClass = "#4CAF50";
    emoji = "🟢";
    bgColor = "rgba(76, 175, 80, 0.1)";
  } else if (level === "MEDIUM") {
    colorClass = "#FF9800";
    emoji = "🟡";
    bgColor = "rgba(255, 152, 0, 0.1)";
  } else {
    colorClass = "#f44336";
    emoji = "🔴";
    bgColor = "rgba(244, 67, 54, 0.1)";
  }

  document.getElementById("prediction-info").innerHTML = `
    <div style="background: ${bgColor}; padding: 15px; border-radius: 10px; border-left: 4px solid ${colorClass};">
      <div style="font-size: 24px; margin-bottom: 10px;">${emoji}</div>
      <div style="font-size: 18px; font-weight: bold; color: ${colorClass};">${level} Traffic</div>
      <div style="font-size: 12px; color: #666; margin-top: 5px;">
        Based on: ${hour}:00, Day ${day}, ${speed} km/h, ${vehicles} vehicles
      </div>
    </div>
    <button onclick="navigate()" style="margin-top: 15px;">
      🧭 Navigate with Google Maps
    </button>
  `;

  // Color the route based on prediction
  colorRoute(level);

  // Add popup to route
  map.eachLayer(function(layer) {
    if (layer instanceof L.Polyline) {
      layer.bindPopup(`<strong>${emoji} ${level} Traffic</strong><br>Speed: ${speed} km/h<br>Vehicles: ${vehicles}`);
    }
  });
}

function colorRoute(level) {
  if (!map) return;
  const color = level === "LOW" ? "green" : level === "MEDIUM" ? "orange" : "red";
  map.eachLayer(function(layer) {
    if (layer instanceof L.Polyline) {
      layer.setStyle({color: color});
    }
  });
}

function navigate() {
  const start = document.getElementById("start").value;
  const dest = document.getElementById("dest").value;
  const url = `https://www.google.com/maps/dir/${encodeURIComponent(start + ', India')}/${encodeURIComponent(dest + ', India')}`;
  window.open(url, '_blank');
}

window.onload = initMap;

function displayResults(data, isFuture = false) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = `<h3>${isFuture ? 'Future (30 Min Ahead)' : 'Traffic'} Prediction</h3>`;
  
  const level = data.prediction || data;
  const color = level === "LOW" ? "green" : level === "MEDIUM" ? "orange" : "red";
  const emoji = level === "LOW" ? "🟢" : level === "MEDIUM" ? "🟡" : "🔴";
  
  resultsDiv.innerHTML += `
    <div class="result-card" style="border-left: 5px solid ${color};">
      <h4>Route Prediction</h4>
      <p>${emoji} ${level} Traffic</p>
      <button onclick="navigate()">Navigate</button>
    </div>
  `;
}