# routes/api.py

from flask import Blueprint, jsonify, request
from services.data_service import fetch_density_data, analyze_population_density

api = Blueprint('api', __name__)

@api.route('/geojson/population-density', methods=['GET'])
def population_density():
    accuracy = request.args.get("accuracy", default=0.01, type=float)
    return fetch_density_data('state', accuracy, "ppl_densit")

@api.route('/analyze-density', methods=['POST', 'OPTIONS'])
def analyze_density():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        data = request.json
        question = data.get('question')
        selected_states = data.get('selected_states', [])
        
        if not question:
            return jsonify({'error': 'No question provided'}), 400
            
        analysis = analyze_population_density(question, selected_states)
        
        if analysis is None:
            return jsonify({'result': None}), 200
            
        return jsonify({'result': analysis}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
