# routes/api.py

from flask import Blueprint, jsonify, request
from services.data_service import fetch_density_data, analyze_population_density, analyze_spatial_question
from services.semantic_service import SemanticService

api = Blueprint('api', __name__)

# Initialize semantic service
semantic_service = SemanticService()

@api.route('/geojson/<dataset>', methods=['GET', 'OPTIONS'])
def get_geojson(dataset):
    """Get GeoJSON data for the specified dataset"""
    if request.method == 'OPTIONS':
        return '', 200
        
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

@api.route('/analyze-question', methods=['POST', 'OPTIONS'])
def analyze_question():
    """Analyze a user question using semantic search"""
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        data = request.json
        question = data.get('question')
        selected_states = data.get('selected_states', [])
        current_dataset = data.get('current_dataset', 'ppl_densit')  # Get current dataset from frontend
        
        if not question:
            return jsonify({'error': 'No question provided'}), 400
            
        # Use the new analyze_spatial_question function
        analysis = analyze_spatial_question(question, selected_states, current_dataset)
        
        if analysis:
            return jsonify({
                'result': analysis['result'],
                'dataset': analysis['dataset']
            }), 200
        else:
            return jsonify({'error': 'Could not analyze question'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api.route('/test', methods=['GET'])
def test():
    return jsonify({"message": "API is working"}), 200

@api.route('/test-cors', methods=['GET', 'OPTIONS'])
def test_cors():
    """Test endpoint for CORS"""
    if request.method == 'OPTIONS':
        return '', 200
    return jsonify({"status": "CORS is working"}), 200
