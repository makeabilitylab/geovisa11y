# routes/api.py

from flask import Blueprint, jsonify, request
from services.data_service import fetch_density_data, analyze_population_density

api = Blueprint('api', __name__)

@api.route('/api/geojson/<dataset>', methods=['GET'])
def get_geojson(dataset):
    """Get GeoJSON data for the specified dataset"""
    try:
        accuracy = request.args.get("accuracy", default=0.01, type=float)
        return fetch_density_data('state', accuracy, dataset)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api.route('/analyze-density', methods=['POST', 'OPTIONS'])
def analyze_density():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        data = request.json
        question = data.get('question')
        selected_states = data.get('selected_states', [])
        dataset = data.get('dataset', 'ppl_densit')
        
        if not question:
            return jsonify({'error': 'No question provided'}), 400
            
        analysis = analyze_population_density(question, selected_states, dataset)
        
        if analysis is None:
            return jsonify({'result': None}), 200
            
        return jsonify({'result': analysis}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
