# routes/api.py

from flask import Blueprint, jsonify, request
from services.data_service import fetch_density_data

api = Blueprint('api', __name__)

@api.route('/geojson/population-density', methods=['GET'])
def population_density():
    accuracy = request.args.get("accuracy", default=0.01, type=float)
    return fetch_density_data('state', accuracy, "ppl_densit")
