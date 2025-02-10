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
                    "content": """You are a helpful assistant specializing in US geography, demographics, and spatial concepts. 
                    When explaining concepts like population density, walking to work percentage, or public transit usage:
                    - Provide clear, concise definitions
                    - Use simple examples when helpful
                    - Explain why the metric is important
                    - Keep responses focused and under 100 words
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
    

def openai_api_request(input):
    try: 
        openai.api_key = DevelopmentConfig.OPENAI_API_KEY
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                { 
                    "role": 'system', 
                    "content": 'You are a helpful assistant to answer questions about geospatial visaulization.' },
                {
                    "role": "user",
                    "content": input
                }
            ],
            temperature=0.7,
            max_tokens=150
        )
        
        return response.choices[0].message.content
    except Exception as e:
        print(f"Error getting OpenAI response: {str(e)}")
        return "openai request error..."
    

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
        print(f"Processing question: {question} for dataset: {current_dataset}")
        
        # Try spatial analysis first
        analysis = analyze_spatial_question(question, current_dataset)
        print(f"Analysis result: {analysis}")
        
        if analysis:
            return jsonify(analysis), 200
        else:
            # Fall back to OpenAI for unrecognized queries
            openai_response = get_openai_response(question)
            print(f"OpenAI response: {openai_response}")
            # Add disclaimer to GPT response with HTML styling
            gpt_response = f"{openai_response}\n<br/><span style='font-size: 0.8em; font-style: italic;'>(Answer provided by GPT-4, may not be entirely accurate.)</span>"
            return jsonify({
                'result': gpt_response,
                'dataset': current_dataset,
                'question_type': 'others'
            }), 200
            
    except Exception as e:
        print(f"Error in analyze_question: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'result': f"I encountered an error processing your question: {str(e)}",
            'dataset': current_dataset,
            'question_type': 'others'
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


VALID_ACTIONS = {
    "retrieve", "compare", "find_extremum", "aggregated_functions",
    "filter", "sort", "data_ranges", "cluster", "is_pattern",
    "describe_pattern", "find_outliers", "correlate", "others"
}

import json
def find_question_type(question):
    """Classify the action requested by the user"""
    CLASSIFY_PROMPT = f"""
    Your goal is to classify the question into one of the following categories:

    The question should be classified into one of the following categories:
    Rule 1: There are 13 action categories. Example questions for each category are provided below.
    {json.dumps([
        {
            "action": "retrieve", 
            "definition": "Retrieve the value of a specific attribute or feature.",
            "example_query": "What’s the population density of {state1}?"
        },
        {
            "action": "compare", 
            "definition": "Compare two or more attributes or features.",
            "example_query": "Which state has higher population density, {state2} or {state3}?"
        },
        {
            "action": "find_extremum", 
            "definition": "Find the highest or lowest value of an attribute or feature.",
            "example_query": "Which state has the {highest/lowest} population density?"
        },
        {
            "action": "aggregated_functions", 
            "definition": "Calculate aggregated functions like average, sum, or count.",
            "example_query": "What's the average population density in this map?"
        },
        {
            "action": "filter", 
            "definition": "Filter the data based on a condition.",
            "example_query": "Which state has a population density of lower than 100 people per square mile?"
        },
        {
            "action": "sort", 
            "definition": "Sort the data based on a specific attribute or feature.",
            "example_query": "What’s the top 3 states with the highest population density?"
        },
        {
            "action": "data_ranges", 
            "definition": "Find the range of values for an attribute or feature.",
            "example_query": "What is the range of population density in the United States?"
        },
        {
            "action": "cluster", 
            "definition": "Find clusters or patterns in the data.",
            "example_query": "Which state has a similar population density to New York?"
        },
        {
            "action": "is_pattern", 
            "definition": "Determine if there is a pattern in the data.",
            "example_query": "Is there a pattern in this map? (run Moran’s I)"
        },
        {
            "action": "describe_pattern", 
            "definition": "Describe the pattern found in the data. Compared to is_pattern, this action requires a more detailed explanation.",
            "example_query": "Can you describe the pattern in this map? (get LISA clusters)"
        },
        {
            "action": "find_outliers", 
            "definition": "Find outliers in the data.",
            "example_query": "What states have high population density despite being surrounded by low population density?"
        },
        {
            "action": "correlate", 
            "definition": "Find relationships between attributes or features.",
            "example_query": "Is there a relationship between income and population density?"
        },
        {
            "action": "others", 
            "definition": "Questions that don’t fit into any of the above categories.",
            "example_query": "What’s population density?"
        }
    ], indent=4)}

    Rule 2: Please return the result in a simple JSON format between two curly braces.
    Rule 3: Please answer the question in this format.:
    {json.dumps({
        "question": "{question}",
        "action": "# only one of the 13 actions in a string"
    })}
    
    Question: {question}
    """

    print("... classify question")
    
    try:
        response = openai_api_request(CLASSIFY_PROMPT)
        
        try:
            response = json.loads(response)
        except Exception as error:
            print("Error parsing JSON response:", error)
            return find_question_type(question + ". Please only provide json response.")

        if response and "action" in response:
            action = response["action"]
            if action in VALID_ACTIONS:
                return action
            else:
                print("Invalid action in response... retrying ...")
                return find_question_type(question + ". Please use one of the following actions: " + ", ".join(VALID_ACTIONS))
        else:
            raise ValueError("No action in response")
    except Exception as error:
        print("Error details:", error)
        return None
        # return "Sorry, I encountered an error when classifying the question. Please try again."



@api.route('/analyze-question-llm', methods=['POST', 'OPTIONS'])
def analyze_question_llm():
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
        
        # Try spatial analysis first
        question_type = find_question_type(question)
        print("Question type:", question_type)
        analysis = analyze_spatial_question(question, question_type, current_dataset)
        print(f"Analysis result: {analysis}")
        
        if analysis:
            return jsonify(analysis), 200
        else:
            # Fall back to OpenAI for unrecognized queries
            openai_response = get_openai_response(question)
            print(f"OpenAI response: {openai_response}")
            # Add disclaimer to GPT response with HTML styling
            gpt_response = f"{openai_response}\n<br/><span style='font-size: 0.8em; font-style: italic;'>(Answer provided by GPT-4, may not be entirely accurate.)</span>"
            return jsonify({
                'result': gpt_response,
                'dataset': current_dataset,
                'question_type': 'others'
            }), 200
            
    except Exception as e:
        print(f"Error in analyze_question: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'result': f"I encountered an error processing your question: {str(e)}",
            'dataset': current_dataset,
            'question_type': 'others'
        }), 200