# routes/log_routes.py
from flask import Blueprint, request, jsonify
from pymongo import MongoClient
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

import datetime
import os

log_bp = Blueprint('logs', __name__)
# To Chu: You can replace the mongo_url with your own MongoDB URI
# MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
MONGO_URI = "mongodb+srv://chuchuli:fgqprkMAZq74CYbG@mappietalkie.tldw8.mongodb.net/?retryWrites=true&w=majority&appName=MappieTalkie"

try:
    client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
    # Test connection with ping
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
    
    # Set up database and collection
    print(client.list_database_names())
    if "analytics_logs" not in client.list_database_names():
        client.create_database("analytics_logs")
    db = client.get_database("analytics_logs")  

    if "logs" not in db.list_collection_names():
        print("Collection does not exist, creating collection...")
        db.create_collection("logs")

    print("Successfully connected to the database!")
    logs_collection = db.logs  
except Exception as e:
    print(f"Error connecting to MongoDB Atlas: {e}")

@log_bp.route('/logs', methods=['POST', 'OPTIONS'])
def save_log():
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({'status': 'ok'})
        response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', 'http://localhost:3000')
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Origin, Accept'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200  # Make sure to return 200 status for OPTIONS

    try:
        log_data = request.json
        
        # Add timestamp
        log_data['timestamp'] = datetime.datetime.utcnow()
        
        # Insert into MongoDB
        result = logs_collection.insert_one(log_data)
        
        response = jsonify({
            'success': True, 
            'message': 'Log saved successfully', 
            'id': str(result.inserted_id),
            'ip': request.remote_addr,
        })
        response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', 'http://localhost:3000')
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 201
    
    except Exception as e:
        print(f"Error saving log: {e}")
        error_response = jsonify({
            'success': False, 
            'message': f'Error saving log: {str(e)}'
        })
        error_response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', 'http://localhost:3000')
        error_response.headers['Access-Control-Allow-Credentials'] = 'true'
        return error_response, 500