# routes/log_routes.py
from flask import Blueprint, request, jsonify, make_response
from pymongo import MongoClient
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

# MongoDB connection
MONGO_URI = os.getenv('MONGO_URI', "mongodb+srv://chuchuli:***REDACTED***@mappietalkie.tldw8.mongodb.net/?retryWrites=true&w=majority&appName=MappieTalkie")

try:
    client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
    # Test connection with ping
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
    logger.info("Pinged your deployment. You successfully connected to MongoDB!")
    
    # Set up database and collection
    logger.info(f"Available databases: {client.list_database_names()}")
    if "analytics_logs" not in client.list_database_names():
        client.create_database("analytics_logs")
    db = client.get_database("analytics_logs")  

    if "logs" not in db.list_collection_names():
        logger.info("Collection does not exist, creating collection...")
        db.create_collection("logs")

    print("Successfully connected to the database!")
    logger.info("Successfully connected to the database!")
    logs_collection = db.logs  
except Exception as e:
    logger.error(f"Error connecting to MongoDB Atlas: {e}")

@log_bp.route('/logs', methods=['POST', 'OPTIONS'])
def log_data():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Add timestamp if not present
        if 'timestamp' not in data:
            data['timestamp'] = datetime.datetime.utcnow()
            
        # Add IP address
        data['ip_address'] = request.remote_addr
        
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
        log_data = request.json
        
        # Add timestamp
        log_data['timestamp'] = datetime.datetime.utcnow()
        log_data['source'] = 'backend'
        
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