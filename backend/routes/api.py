# routes/api.py

from flask import Blueprint, jsonify, request, make_response
from services.data_service import fetch_data, answer_question, retrieve_value, fetch_fuel_data
from services.semantic_service import SemanticService
import openai
from config import DevelopmentConfig
import traceback
import re
import time
import uuid
import logging
from routes.log_routes import logs_collection
import datetime
import json

api = Blueprint('api', __name__)

# Initialize semantic service
semantic_service = SemanticService()

# Set up logging
logging.basicConfig(
    level=logging.WARNING,  # Change from INFO to WARNING to reduce output
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        # Remove file handler that's causing permission issues
        # logging.FileHandler("app_logs.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

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
        # Return empty response for OPTIONS request
        return '', 200
        
    try:
        accuracy = request.args.get("accuracy", default=0.01, type=float)
        value_column = request.args.get("dataset", default=dataset)
        state_filter = request.args.get("state", default=None)
        
        # Always use the 'state' table for state-level data
        return fetch_data('state', accuracy, value_column, state_filter)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def log_backend_processing(question_id, processing_data):
    try:
        processing_data['question_id'] = question_id
        processing_data['timestamp'] = datetime.datetime.utcnow()
        processing_data['source'] = 'backend'
        processing_data['log_type'] = 'processing'
        
        # Insert into MongoDB
        result = logs_collection.insert_one(processing_data)
        logger.info(f"Backend processing log saved: {processing_data}")
        return str(result.inserted_id)
    except Exception as e:
        logger.error(f"Error saving backend processing log: {e}")
        return None

@api.route('/analyze-input', methods=['POST', 'OPTIONS'])
def analyze_input():
    """Analyze and handle user input - either action or question"""
    if request.method == 'OPTIONS':
        return '', 200
        
    start_time = time.time()
    question_id = request.json.get('question_id', str(uuid.uuid4()))
    
    try:
        data = request.json
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No data provided'}), 400
            
        user_input = data.get('input')
        if not user_input:
            logger.error("No input in request")
            return jsonify({'error': 'No input provided'}), 400
            
        current_dataset = data.get('current_dataset', 'ppl_densit')
        # Define all available datasets
        available_datasets = ['ppl_densit', 'pct_tot_co', 'pct_no_bb_', 'gas', 'electricity', 'oil', 'pct_gas', 'pct_electr', 'pct_oil']
        current_focus = data.get('current_focus')
        previous_answer = data.get('previous_answer')
        conversation_history = data.get('conversation_history', [])
        raw_county = data.get('raw_county')
        raw_state = data.get('raw_state')
        
        # Debug the incoming data
        print(f"Processing input: {user_input} for dataset: {current_dataset}")
        print(f"Current focus: {current_focus}")
        print(f"Raw county: {raw_county}, Raw state: {raw_state}")
        
        # Fix for county context - if we have raw_county and raw_state but current_focus is just the state
        if raw_county and raw_state and (not isinstance(current_focus, dict) or not current_focus.get('county')):
            # Create a proper county context
            state_name = raw_state[0] if isinstance(raw_state, list) else raw_state
            current_focus = {
                'county': raw_county,
                'state': state_name,
                'full': f"{raw_county} County, {state_name}"
            }
            print(f"Updated current_focus to include county: {current_focus}")
        
        # Handle the new focus structure where state is in the states array
        if isinstance(current_focus, dict) and current_focus.get('states') and len(current_focus['states']) > 0 and not current_focus.get('state'):
            current_focus['state'] = current_focus['states'][0]
            print(f"Updated current_focus with state from states array: {current_focus}")
        
        print(f"Conversation history: {conversation_history}")
        logger.info(f"Processing input: {user_input} for dataset: {current_dataset}")
        logger.info(f"Conversation history: {conversation_history[:2]}...")

        # 1. Check if input is an action using semantic service
        is_action, location_info = semantic_service.is_navigation_action(user_input)
        
        # Log the action check
        log_backend_processing(question_id, {
            'step': 'action_check',
            'is_action': is_action,
            'location_info': location_info
        })
        
        if is_action and location_info:
            location_type, info = location_info
            if location_type == "city":
                processing_time = time.time() - start_time
                
                # Log the final result
                log_backend_processing(question_id, {
                    'step': 'final_result',
                    'result_type': 'action',
                    'action_type': 'focus_city',
                    'city_name': info['city'],
                    'state': info['state'],
                    'processing_time_ms': processing_time * 1000
                })
                
                return jsonify({
                    'is_action': True,
                    'action_type': 'focus_city',
                    'city_name': info['city'],
                    'state': info['state'],
                    'coordinates': info['coordinates'],
                    'processing_time_ms': processing_time * 1000,
                    'question_id': question_id
                }), 200
            else:  # state navigation
                processing_time = time.time() - start_time
                
                # Log the final result
                log_backend_processing(question_id, {
                    'step': 'final_result',
                    'result_type': 'action',
                    'action_type': 'focus',
                    'state': info,
                    'processing_time_ms': processing_time * 1000
                })
                
                return jsonify({
                    'is_action': True,
                    'action_type': 'focus',
                    'state': info,
                    'processing_time_ms': processing_time * 1000,
                    'question_id': question_id
                }), 200

        # 2. If not action, treat as question and get question type
        question_type = semantic_service.identify_question_type(user_input)
        # print(f"Question type identified: {question_type}")
        logger.info(f"Question type identified: {question_type}")
        
        # Log question type
        log_backend_processing(question_id, {
            'step': 'question_type',
            'question_type': question_type
        })

        # 3. Handle pattern-related questions directly
        if question_type in ['get_pattern', 'find_outliers', 'urban_rural_comparison']:
            analysis = answer_question(user_input, current_dataset, current_focus)
            if analysis:
                processing_time = time.time() - start_time
                
                # Log the final result
                log_backend_processing(question_id, {
                    'step': 'final_result',
                    'result_type': 'pattern_question',
                    'question_type': question_type,
                    'processing_time_ms': processing_time * 1000
                })
                
                analysis['processing_time_ms'] = processing_time * 1000
                analysis['question_id'] = question_id
                return jsonify(analysis), 200

        # 4. For other questions, check ambiguity first
        # Process context for ambiguity check
        if raw_county and raw_state:
            state_name = raw_state[0] if isinstance(raw_state, list) else raw_state
            context = f"{raw_county} County, {state_name}"
        else:
            if isinstance(current_focus, dict):
                if current_focus.get('county') and current_focus.get('state'):
                    context = f"{current_focus['county']} County, {current_focus['state']}"
                else:
                    context = current_focus.get('state') or current_focus.get('full')
            else:
                context = current_focus

        is_ambiguous, ambiguity_type, ambiguity_context = semantic_service.is_ambiguous_question(
            user_input, previous_answer, context, conversation_history
        )
        
        # Log ambiguity check
        log_backend_processing(question_id, {
            'step': 'ambiguity_check',
            'is_ambiguous': is_ambiguous,
            'ambiguity_type': ambiguity_type,
            'ambiguity_context': ambiguity_context
        })

        if is_ambiguous:
            resolved_question = semantic_service.resolve_ambiguous_question(
                user_input, ambiguity_type, ambiguity_context, conversation_history
            )
            
            # Log question resolution
            log_backend_processing(question_id, {
                'step': 'question_resolution',
                'original_question': user_input,
                'resolved_question': resolved_question
            })
            
            if not resolved_question:
                processing_time = time.time() - start_time
                
                # Log the final result
                log_backend_processing(question_id, {
                    'step': 'final_result',
                    'result_type': 'clarification_needed',
                    'processing_time_ms': processing_time * 1000
                })
                
                return jsonify({
                    'result': "Could you please specify which state or location you're referring to?",
                    'question_type': 'clarification_needed',
                    'processing_time_ms': processing_time * 1000,
                    'question_id': question_id
                }), 200
            user_input = resolved_question

        # 5. Check if question is out of scope for current dataset but in scope for another dataset
        print(f"Checking out of scope: {user_input}, Current dataset: {current_dataset}, Available datasets: {available_datasets}")
        is_out_of_scope, matching_dataset = semantic_service.is_out_of_scope(user_input, current_dataset, available_datasets)
        
        # Log out of scope check
        log_backend_processing(question_id, {
            'step': 'out_of_scope_check',
            'is_out_of_scope': is_out_of_scope,
            'matching_dataset': matching_dataset
        })
        # If out of scope for all datasets, use OpenAI
        if is_out_of_scope and matching_dataset is None:
            openai_response = get_openai_response(user_input)
            processing_time = time.time() - start_time
            
            # Log the final result
            log_backend_processing(question_id, {
                'step': 'final_result',
                'result_type': 'out_of_scope',
                'processing_time_ms': processing_time * 1000
            })
            
            return jsonify({
                'result': f"{openai_response}\n<br/><span style='font-size: 0.8em; font-style: italic;'></span>",
                'dataset': current_dataset,
                'question_type': 'others',
                'processing_time_ms': processing_time * 1000,
                'question_id': question_id
            }), 200
        
        # If we found a matching dataset different from current_dataset, use it
        dataset_to_use = matching_dataset if matching_dataset else current_dataset

        print(f"Dataset to use: {dataset_to_use}")
        
        # # 6. Handle county-specific questions
        # county_info = extract_county_info(user_input)
        
        # # Log county extraction
        # log_backend_processing(question_id, {
        #     'step': 'county_extraction',
        #     'county_info': county_info
        # })
        
        # if county_info:
        #     county_name, state_name = county_info
        #     result = retrieve_value(county_name, dataset_to_use, is_county=True)
        #     if result:
        #         processing_time = time.time() - start_time
                
        #         # Log the final result
        #         log_backend_processing(question_id, {
        #             'step': 'final_result',
        #             'result_type': 'county_question',
        #             'county_name': county_name,
        #             'state_name': state_name,
        #             'dataset_used': dataset_to_use,
        #             'processing_time_ms': processing_time * 1000
        #         })
                
        #         return jsonify({
        #             'result': result['result'],
        #             'question_type': 'retrieve',
        #             'county': county_name,
        #             'state': state_name,
        #             'dataset': dataset_to_use,  # Include the dataset used
        #             'dataset_changed': dataset_to_use != current_dataset,  # Flag if dataset changed TBD
        #             'processing_time_ms': processing_time * 1000,
        #             'question_id': question_id
        #         }), 200

        # 7. Handle all other questions
        analysis = answer_question(user_input, dataset_to_use, current_focus)
        
        # Log answer generation
        log_backend_processing(question_id, {
            'step': 'answer_generation',
            'analysis_success': analysis is not None,
            'dataset_used': dataset_to_use
        })
        
        if analysis:
            processing_time = time.time() - start_time
            
            # Log the final result
            log_backend_processing(question_id, {
                'step': 'final_result',
                'result_type': 'standard_question',
                'question_type': analysis.get('question_type'),
                'dataset_used': dataset_to_use,
                'processing_time_ms': processing_time * 1000
            })
            
            analysis['processing_time_ms'] = processing_time * 1000
            analysis['question_id'] = question_id
            analysis['dataset_changed'] = dataset_to_use != current_dataset  # Flag if dataset changed TBD
            return jsonify(analysis), 200

        # 8. Fallback to GPT
        openai_response = get_openai_response(user_input)
        processing_time = time.time() - start_time
        
        # Log the final result
        log_backend_processing(question_id, {
            'step': 'final_result',
            'result_type': 'fallback_gpt',
            'processing_time_ms': processing_time * 1000
        })
        
        return jsonify({
            'result': f"{openai_response}\n<br/><span style='font-size: 0.8em; font-style: italic;'></span>",
            'dataset': current_dataset,
            'question_type': 'other',
            'processing_time_ms': processing_time * 1000,
            'question_id': question_id
        }), 200

    except Exception as e:
        logger.error(f"Error in analyze_input: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        
        # Log the error
        log_backend_processing(question_id, {
            'step': 'error',
            'error_message': str(e),
            'traceback': traceback.format_exc()
        })
        
        processing_time = time.time() - start_time
        return jsonify({
            'error': str(e),
            'processing_time_ms': processing_time * 1000,
            'question_id': question_id
        }), 500

# def extract_county_info(input_text):
#     """Extract county and state information from input text"""
#     county_patterns = [
#         r'in\s+([A-Za-z\s]+?)\s+County(?:\s*,\s*|\s+in\s+)([A-Za-z\s]+)',
#         r'(?:of|in)\s+([A-Za-z\s]+?)\s+County(?:\s*,\s*|\s+in\s+)([A-Za-z\s]+)',
#         r'(?:of|in)\s+([A-Za-z\s]+?)\s+County(?:\s*,\s*)([A-Za-z\s]+)',
#         r'([A-Za-z\s]+?)\s+County(?:\s*,\s*|\s+in\s+)([A-Za-z\s]+)'  # Added more flexible pattern
#     ]

#     # Clean up the input first
#     clean_input = input_text.replace("What's", "").replace("what's", "").strip()
#     clean_input = re.sub(r'^the\s+|^of\s+', '', clean_input)
#     clean_input = clean_input.strip()

#     # Try to extract from patterns
#     for pattern in county_patterns:
#         match = re.search(pattern, clean_input, re.IGNORECASE)
#         if match:
#             return (match.group(1).strip().replace(" County", ""), match.group(2).strip())

#     # Check if the input was resolved from "here"
#     if "County" in clean_input:
#         parts = clean_input.split("County,")
#         if len(parts) == 2:
#             return (parts[0].strip(), parts[1].strip())

#     return None

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
        
        # Get the dataset from query parameters, default to population density
        dataset = request.args.get("dataset", default="ppl_densit", type=str)
        print(f"Using dataset: {dataset}")  # Debug log
        
        # Handle array input
        if isinstance(state_name, list):
            state_name = state_name[0]
            
        # Clean up state name
        state_name = state_name.strip()
        
        print(f"Normalized state name: {state_name}")  # Debug log
        
        # For Task2, use the fuel data function
        if dataset in ['gas', 'electricity', 'oil']:
            return fetch_fuel_data('county', accuracy, state_name)
        else:
            return fetch_data('county', accuracy, dataset, state_name)
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
        raw_county = data.get('raw_county')
        raw_state = data.get('raw_state')
        conversation_history = data.get('conversation_history', [])

        # Handle the new focus structure where state is in the states array
        if isinstance(current_focus, dict) and current_focus.get('states') and len(current_focus['states']) > 0 and not current_focus.get('state'):
            current_focus['state'] = current_focus['states'][0]
            print(f"Updated current_focus with state from states array: {current_focus}")

        # Handle the context based on county and state information
        if raw_county and raw_state:
            # When we have both county and state
            state_name = raw_state[0] if isinstance(raw_state, list) else raw_state
            context = f"{raw_county} County, {state_name}"
        else:
            # Fall back to the current_focus handling
            if isinstance(current_focus, dict):
                if current_focus.get('county') and (current_focus.get('state') or (current_focus.get('states') and len(current_focus['states']) > 0)):
                    state_name = current_focus.get('state') or current_focus['states'][0]
                    context = f"{current_focus['county']} County, {state_name}"
                else:
                    context = current_focus.get('state') or (current_focus['states'][0] if current_focus.get('states') and len(current_focus['states']) > 0 else None) or current_focus.get('full')
            else:
                context = current_focus

        print("Processing ambiguity check:", {
            'question': question,
            'previous_answer': previous_answer,
            'context': context,  # Log the processed context
            'conversation_history': conversation_history[:2] + ['...'] if len(conversation_history) > 2 else conversation_history
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
            context,
            conversation_history
        )

        if is_ambiguous:
            resolved_question = semantic_service.resolve_ambiguous_question(
                question, 
                ambiguity_type, 
                context,
                conversation_history
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


@api.route('/geojson/county', methods=['GET', 'OPTIONS'])
def get_county_geojson():
    """Get GeoJSON data for counties"""
    if request.method == 'OPTIONS':
        # Explicitly return response for OPTIONS request
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response
        
    try:
        accuracy = request.args.get("accuracy", default=0.01, type=float)
        value_column = request.args.get("dataset", default="ppl_densit")
        state_filter = request.args.get("state", default=None)
        
        # Use the consolidated 'county' table
        return fetch_data('county', accuracy, value_column, state_filter)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api.route('/geojson/task2_state', methods=['GET', 'OPTIONS'])
def get_task2_geojson():
    """Get GeoJSON data for the task2 dataset with multiple fuel types"""
    if request.method == 'OPTIONS':
        # Explicitly return response for OPTIONS request
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response
        
    try:
        accuracy = request.args.get("accuracy", default=0.01, type=float)
        
        # Use the state table instead of task2_state
        return fetch_fuel_data('state', accuracy)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api.route('/lisa_clusters/<state_name>', methods=['GET'])
def get_lisa_clusters(state_name):
    """Get LISA clusters for a state or its counties"""
    try:
        dataset = request.args.get('dataset', 'ppl_densit')
        level = request.args.get('level', 'state')  # 'state' or 'county'
        
        # Import the data_service module here to avoid circular imports
        from services.data_service import get_lisa_clusters as get_clusters
        
        # Get LISA clusters
        clusters = get_clusters(dataset, state_name if level == 'county' else None)
        
        # If we're requesting county-level clusters, we need to update the county GeoJSON
        if level == 'county':
            # Get the county GeoJSON first
            county_response = get_counties(state_name)
            county_data = json.loads(county_response.data)
            
            # Update features with LISA classifications
            for feature in county_data['features']:
                county_name = feature['properties']['county_name']
                
                # Check which cluster this county belongs to
                for cluster_type in ['HH', 'LL', 'HL', 'LH']:
                    if county_name in clusters[cluster_type]:
                        feature['properties']['lisa_class'] = cluster_type
                        break
            
            return jsonify(county_data)
        
        # For state-level, just return the clusters
        return jsonify(clusters)
        
    except Exception as e:
        print(f"Error getting LISA clusters: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500
