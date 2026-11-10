"""Retro Rides - parking API.

POST   /api/cars          camera reports a plate     -> 201 / 400 / 409
GET    /api/cars          dashboard asks who is in   -> 200 JSON
DELETE /api/cars/<plate>  attendant releases a car   -> 204 / 404
GET    /api/health        used by the Docker health check

Data lives in Redis (persisted to the Volume by AOF):
  parking:cars     hash   plate -> arrival time (unix seconds, UTC)
  parking:total    int    how many cars entered, ever
  parking:seeded   flag   the 4 starter cars were already added once
"""
import os
import re
import time

import redis
from flask import Flask, jsonify, request

CAPACITY = 6
PLATE_RE = re.compile(r"^[A-Z0-9-]{2,12}$")
CARS = "parking:cars"
TOTAL = "parking:total"
SEEDED = "parking:seeded"
# plate -> minutes ago (same starter cars as the Track 1 version)
STARTERS = {"BELAIR-55": 95, "T-BIRD-58": 50, "WOODY-48": 25, "MODEL-T-1": 8}

app = Flask(__name__)
db = redis.Redis(
    host=os.environ.get("REDIS_HOST", "redis"),
    port=int(os.environ.get("REDIS_PORT", "6379")),
    decode_responses=True,
    socket_connect_timeout=2,
    socket_timeout=2,
)


def seed_once():
    """Add the starter cars only the very first time (flag lives in Redis too)."""
    if db.set(SEEDED, "1", nx=True):
        now = int(time.time())
        pipe = db.pipeline()
        for plate, minutes in STARTERS.items():
            pipe.hset(CARS, plate, now - minutes * 60)
        pipe.incrby(TOTAL, len(STARTERS))
        pipe.execute()


def snapshot():
    cars = [
        {"plate": p, "arrived_at": int(t)}
        for p, t in db.hgetall(CARS).items()
    ]
    cars.sort(key=lambda c: c["arrived_at"], reverse=True)  # newest first
    return {
        "capacity": CAPACITY,
        "parked": len(cars),
        "total_entered": int(db.get(TOTAL) or 0),
        "cars": cars,
    }


@app.get("/api/health")
def health():
    try:
        db.ping()
        seed_once()
    except redis.RedisError:
        return jsonify(status="redis unavailable"), 503
    return jsonify(status="ok")


@app.get("/api/cars")
def list_cars():
    try:
        seed_once()
        return jsonify(snapshot())
    except redis.RedisError:
        return jsonify(error="database unavailable"), 503


@app.post("/api/cars")
def add_car():
    body = request.get_json(silent=True) or {}
    plate = str(body.get("plate", "")).strip().upper()
    if not PLATE_RE.match(plate):
        return jsonify(error="plate must be 2-12 chars: A-Z, 0-9, dash"), 400
    try:
        seed_once()
        if not db.hsetnx(CARS, plate, int(time.time())):
            return jsonify(error="car is already in the lot"), 409
        db.incr(TOTAL)
        return jsonify(plate=plate, **snapshot()), 201
    except redis.RedisError:
        return jsonify(error="database unavailable"), 503


@app.delete("/api/cars/<plate>")
def release_car(plate):
    plate = plate.upper()
    if not PLATE_RE.match(plate):
        return jsonify(error="bad plate"), 400
    try:
        if db.hdel(CARS, plate) == 0:
            return jsonify(error="no such car"), 404
        return "", 204
    except redis.RedisError:
        return jsonify(error="database unavailable"), 503
