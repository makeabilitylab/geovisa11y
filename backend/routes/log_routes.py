# routes/log_routes.py
from flask import Blueprint, request, jsonify
from pymongo import MongoClient
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

import datetime
import os

log_bp = Blueprint('logs', __name__)
# To Chu: You can replace the mongo_url with your own MongoDB URI
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')

try:
    client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
    # Test connection with ping
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
    
    # Set up database and collection
    db = client.get_database("analytics_logs")  
    print("Successfully connected to the database!")
    logs_collection = db.logs  
except Exception as e:
    print(f"Error connecting to MongoDB Atlas: {e}")

@log_bp.route('/logs', methods=['POST'])
def save_log():
    try:
        log_data = request.json
        
        # Add timestamp
        log_data['timestamp'] = datetime.datetime.utcnow()
        
        # Insert into MongoDB
        result = logs_collection.insert_one(log_data)
        
        return jsonify({
            'success': True, 
            'message': 'Log saved successfully', 
            'id': str(result.inserted_id)
        }), 201
    
    except Exception as e:
        print(f"Error saving log: {e}")
        return jsonify({
            'success': False, 
            'message': f'Error saving log: {str(e)}'
        }), 500