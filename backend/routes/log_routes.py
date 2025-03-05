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
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("app_logs.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

log_bp = Blueprint('logs', __name__)

# MongoDB connection
MONGO_URI = os.getenv('MONGO_URI', "mongodb+srv://chuchuli:fgqprkMAZq74CYbG@mappietalkie.tldw8.mongodb.net/?retryWrites=true&w=majority&appName=MappieTalkie")

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
        response = make_response()
        response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Origin, Accept'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'  # Cache preflight response for 1 hour
        return response, 200

    try:
        log_data = request.json
        
        # Add timestamp and IP address
        log_data['timestamp'] = datetime.datetime.utcnow()
        log_data['ip_address'] = request.remote_addr
        log_data['source'] = 'frontend'
        
        # Log the data
        logger.info(f"Received log data: {log_data}")
        
        # Insert into MongoDB
        result = logs_collection.insert_one(log_data)
        
        # Set CORS headers for the main response
        response = jsonify({
            'success': True, 
            'message': 'Log saved successfully', 
            'id': str(result.inserted_id)
        })
        response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        
        return response, 201
    
    except Exception as e:
        logger.error(f"Error saving log: {e}")
        response = jsonify({
            'success': False, 
            'message': f'Error saving log: {str(e)}'
        })
        response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500

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