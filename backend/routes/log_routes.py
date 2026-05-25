# routes/log_routes.py
from flask import Blueprint, request, jsonify, make_response
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import datetime
import os
import uuid
import logging

# Set up logging
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        # Remove file handler that's causing permission issues
        # logging.FileHandler("app_logs.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

log_bp = Blueprint('logs', __name__)

# MongoDB connection - always define logs_collection so imports succeed even when DB is down
logs_collection = None

MONGO_URI = os.getenv('MONGO_URI')

if not MONGO_URI:
    logger.warning("MONGO_URI not set — logging endpoints will be disabled")
else:
    try:
        client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
        client.admin.command('ping')
        logger.info("Successfully connected to MongoDB Atlas")

        db = client.get_database("analytics_logs")
        if "logs" not in db.list_collection_names():
            db.create_collection("logs")

        logs_collection = db.logs
    except Exception as e:
        logger.error(f"Error connecting to MongoDB Atlas: {e}")


def get_client_ip(request):
    """
    Handles various proxy setups by checking headers in order of reliability
    """ 
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0].split(',')[0].strip()
    
    elif request.headers.get("X-Real-IP"):
        return request.headers.get("X-Real-IP")
    
    else:
        return request.remote_addr
    

@log_bp.route('/logs', methods=['POST', 'OPTIONS'])
def log_data():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        return '', 200

    try:
        if logs_collection is None:
            return jsonify({'id': 'logging-unavailable', 'warning': 'MongoDB not connected'}), 201

        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Add timestamp if not present
        if 'timestamp' not in data:
            data['timestamp'] = datetime.datetime.utcnow()
            
        # Add IP address
        data['ip_address'] = get_client_ip(request) #request.remote_addr
        
        # Add source
        data['source'] = 'frontend'
        
        # Insert into MongoDB
        result = logs_collection.insert_one(data)
        
        # Comment out or remove this line to stop printing logs
        # logger.info(f"Received log data: {data}")
        
        return jsonify({'id': str(result.inserted_id)}), 201
        
    except Exception as e:
        logger.error(f"Error logging data: {e}")
        return jsonify({'error': str(e)}), 500

# Backend-specific logging endpoint
@log_bp.route('/backend-logs', methods=['POST'])
def save_backend_log():
    try:
        if logs_collection is None:
            return jsonify({
                'success': True,
                'message': 'Logging skipped (MongoDB not connected)',
                'id': None
            }), 201

        log_data = request.json
        
        # Add timestamp
        log_data['timestamp'] = datetime.datetime.utcnow()
        log_data['source'] = 'backend'
        log_data['session_id'] = request.json.get('session_id')
        
        # Insert into MongoDB
        result = logs_collection.insert_one(log_data)
        
        return jsonify({
            'success': True, 
            'message': 'Backend log saved successfully', 
            'id': str(result.inserted_id)
        }), 201
    
    except Exception as e:
        logger.error(f"Error saving backend log: {e}")
        return jsonify({
            'success': False, 
            'message': f'Error saving backend log: {str(e)}'
        }), 500