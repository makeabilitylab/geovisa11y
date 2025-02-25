# routes/api.py

from flask import Blueprint, jsonify, request, make_response
from services.data_service import fetch_data, answer_question, retrieve_value
from services.semantic_service import SemanticService
import openai
from config import DevelopmentConfig
import traceback
import re

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
                    "content": """You are a helpful assistant specializing in US geography, demographics, and spatial concepts. 
                    When explaining concepts like population density, walking to work percentage, or public transit usage:
                    - Provide clear, concise definitions
                    - Use simple examples when helpful
                    - Explain why the metric is important
                    - Keep responses focused and under 50 words
                    """
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
        return fetch_data('state', accuracy, dataset)
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
        print(f"Processing question: {question} for dataset: {current_dataset}")

        # 1. Get the question type
        question_type = semantic_service.identify_question_type(question)
        
        # 2. Skip metric check for pattern-related questions
        if question_type not in ['is_pattern', 'describe_pattern', 'find_outliers']:
            metric_name = semantic_service.dataset_terms[current_dataset]['metric']
            # 3. Determine if the question is out of scope
            if semantic_service.is_out_of_scope(question, metric_name):
                openai_response = get_openai_response(question)
                gpt_response = f"{openai_response}\n<br/><span style='font-size: 0.8em; font-style: italic;'></span>"
                # (Answer provided by GPT-4, may not be entirely accurate.)
                # </span>"
                return jsonify({
                    'result': gpt_response,
                    'dataset': current_dataset,
                    'question_type': 'others'
                }), 200

        # Update county detection regex to handle more formats
        county_patterns = [
            r'in\s+([A-Za-z\s]+?)\s+County(?:\s*,\s*|\s+in\s+)([A-Za-z\s]+)',  # "in County X in/,State Y"
            r'(?:of|in)\s+([A-Za-z\s]+?)\s+County(?:\s*,\s*|\s+in\s+)([A-Za-z\s]+)',  # "of/in County X in/,State Y"
            r'(?:of|in)\s+([A-Za-z\s]+?)\s+County(?:\s*,\s*)([A-Za-z\s]+)',  # "of/in County X, State Y"
        ]
        
        is_county = False
        county_name = None
        state_name = None
        
        # Clean up the question first
        clean_question = question.replace("What's", "").replace("what's", "").strip()
        clean_question = re.sub(r'^the\s+|^of\s+', '', clean_question)
        clean_question = clean_question.strip()
        
        # First try to extract from patterns
        for pattern in county_patterns:
            match = re.search(pattern, clean_question, re.IGNORECASE)
            if match:
                is_county = True
                county_name = match.group(1).strip()
                state_name = match.group(2).strip()
                break
        
        # If no match found, check if the question was resolved from "here"
        if not is_county and "County" in clean_question:
            parts = clean_question.split("County,")
            if len(parts) == 2:
                county_name = parts[0].strip()
                state_name = parts[1].strip()
                is_county = True

        # Handle county-level questions
        if question_type == 'retrieve' or is_county:
            if county_name and state_name:
                # Remove "County" from county name if present
                county_name = county_name.replace(" County", "")
                print(f"Querying for county: {county_name} in state: {state_name}")  # Debug log
                result = retrieve_value(county_name, current_dataset, is_county=True)
                if result:
                    return jsonify({
                        'result': result['result'],
                        'question_type': 'retrieve',
                        'county': county_name,
                        'state': state_name
                    }), 200
                else:
                    return jsonify({
                        'result': f"Could not find data for {county_name} County in {state_name}.",
                        'question_type': 'retrieve'
                    }), 200

        # Handle all other questions (state-level, patterns, etc.)
        analysis = answer_question(question, current_dataset)
        if analysis:
            return jsonify(analysis), 200
        
        # Fall back to OpenAI for conceptual questions
        openai_response = get_openai_response(question)
        gpt_response = f"{openai_response}\n<br/><span style='font-size: 0.8em; font-style: italic;'></span>"
        return jsonify({
            'result': gpt_response,
            'dataset': current_dataset,
            'question_type': 'other'
        }), 200
            
    except Exception as e:
        print(f"Error in analyze_question: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        return jsonify({
            'error': str(e)
        }), 500 

@api.route('/test', methods=['GET'])
def test():
    return jsonify({"message": "API is working!"})

@api.route('/test-cors', methods=['GET', 'OPTIONS'])
def test_cors():
    """Test endpoint for CORS"""
    if request.method == 'OPTIONS':
        return '', 200
    return jsonify({"status": "CORS is working"}), 200

@api.route('/counties/<state_name>', methods=['GET'])
def get_counties(state_name):
    """Get GeoJSON data for all counties in a state"""
    try:
        print(f"Fetching counties for state: {state_name}")  # Debug log
        accuracy = request.args.get("accuracy", default=0.01, type=float)
        
        # Handle array input
        if isinstance(state_name, list):
            state_name = state_name[0]
            
        # Clean up state name
        state_name = state_name.strip()
        
        print(f"Normalized state name: {state_name}")  # Debug log
        
        result = fetch_data('county', accuracy, value_column='ppl_densit', state_filter=state_name)
        print(f"Result type: {type(result)}")  # Debug log
        return result
    except Exception as e:
        print(f"Error fetching counties: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@api.route('/check-ambiguity', methods=['POST', 'OPTIONS'])
def check_ambiguity():
    """Check if a question is ambiguous and resolve if possible"""
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return make_response()  

    try:
        data = request.json
        print("Received ambiguity check data:", data)
        
        question = data.get('question')
        previous_answer = data.get('previous_answer')
        current_focus = data.get('current_focus')
        raw_county = data.get('raw_county')  # Get the raw county name
        raw_state = data.get('raw_state')    # Get the raw state name

        # Handle the context based on county and state information
        if raw_county and raw_state:
            # If we have both county and state, format it properly
            state_name = raw_state[0] if isinstance(raw_state, list) else raw_state
            context = f"{raw_county} County, {state_name}"
        else:
            # Fall back to the current_focus handling
            if isinstance(current_focus, dict):
                if current_focus.get('county') and current_focus.get('state'):
                    context = f"{current_focus['county']} County, {current_focus['state']}"
                else:
                    context = current_focus.get('state') or current_focus.get('full')
            else:
                context = current_focus

        print("Processing ambiguity check:", {
            'question': question,
            'previous_answer': previous_answer,
            'context': context  # Log the processed context
        })

        if not question:
            return jsonify({'error': 'No question provided'}), 400

        # If question contains "here" and we have context, resolve it while preserving the original question
        if 'here' in question.lower() and context:
            # Replace "here" with the context while keeping the rest of the question intact
            resolved_question = question.lower().replace('here', f"in {context}")
            return jsonify({
                'is_ambiguous': True,
                'resolved_question': resolved_question
            })

        is_ambiguous, ambiguity_type, context = semantic_service.is_ambiguous_question(
            question, 
            previous_answer, 
            context
        )

        if is_ambiguous:
            resolved_question = semantic_service.resolve_ambiguous_question(
                question, 
                ambiguity_type, 
                context
            )
            return jsonify({
                'is_ambiguous': True,
                'resolved_question': resolved_question
            })

        return jsonify({
            'is_ambiguous': False,
            'resolved_question': question
        })

    except Exception as e:
        print(f"Error checking ambiguity: {str(e)}")
        return jsonify({'error': str(e)}), 500
