# routes/api.py

from flask import Blueprint, jsonify, request, make_response
from services.data_service import fetch_density_data, analyze_state_data, analyze_spatial_question
from services.semantic_service import SemanticService
import openai
from config import DevelopmentConfig
import traceback

api = Blueprint('api', __name__)

# Initialize semantic service
semantic_service = SemanticService()

def get_openai_response(question):
    """Get a response from OpenAI for questions we can't handle"""
    try:
        openai.api_key = DevelopmentConfig.OPENAI_API_KEY
        
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant specializing in US geography and demographics. When users ask about invalid locations or data you don't have, explain that you can only provide information about US states and territories."
                },
                {
                    "role": "user",
                    "content": question
                }
            ],
            temperature=0.7,
            max_tokens=150
        )
        
        return response.choices[0].message.content
    except Exception as e:
        print(f"Error getting OpenAI response: {str(e)}")
        return "I can only provide information about US states and territories. Please ask about a valid US state."

@api.route('/geojson/<dataset>', methods=['GET', 'OPTIONS'])
def get_geojson(dataset):
    """Get GeoJSON data for the specified dataset"""
    if request.method == 'OPTIONS':
        # Explicitly return response for OPTIONS request
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response
        
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
            
        analysis = analyze_state_data(question, selected_states, dataset)
        
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
        if not data:
            print("No JSON data received")
            return jsonify({'error': 'No data provided'}), 400
            
        question = data.get('question')
        if not question:
            print("No question in request")
            return jsonify({'error': 'No question provided'}), 400
            
        current_dataset = data.get('current_dataset', 'ppl_densit')
        print(f"Processing question: {question} for dataset: {current_dataset}")  # Debug log
        
        # Try spatial analysis first
        analysis = analyze_spatial_question(question, current_dataset)
        print(f"Analysis result: {analysis}")  # Debug log
        
        if analysis:
            return jsonify(analysis), 200
        else:
            # Fall back to OpenAI for unrecognized queries
            openai_response = get_openai_response(question)
            print(f"OpenAI response: {openai_response}")  # Debug log
            return jsonify({
                'result': openai_response,
                'dataset': current_dataset,
                'question_type': 'other'
            }), 200
            
    except Exception as e:
        print(f"Error in analyze_question: {str(e)}")
        traceback.print_exc()  # Print full traceback
        return jsonify({
            'result': f"I encountered an error processing your question: {str(e)}",
            'dataset': current_dataset,
            'question_type': 'other'
        }), 200

@api.route('/test', methods=['GET'])
def test():
    return jsonify({"message": "API is working"}), 200

@api.route('/test-cors', methods=['GET', 'OPTIONS'])
def test_cors():
    """Test endpoint for CORS"""
    if request.method == 'OPTIONS':
        return '', 200
    return jsonify({"status": "CORS is working"}), 200
