# app.py 
from flask import Flask, jsonify, request
from flask_cors import CORS
from routes.api import api
from config import DevelopmentConfig

# Create the Flask app instance
app = Flask(__name__)

# Apply the configuration
app.config.from_object(DevelopmentConfig)

# Basic CORS configuration
CORS(app)

# Register blueprints
app.register_blueprint(api)

@app.after_request
def after_request(response):
    response.headers.update({
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    return response

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
