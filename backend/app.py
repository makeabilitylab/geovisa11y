# app.py 
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from routes.api import api
from routes.test_routes import test_bp
from routes.log_routes import log_bp
from config import DevelopmentConfig, ProductionConfig

# Create the Flask app instance
app = Flask(__name__)

# Determine environment and apply configuration
if os.getenv('GAE_ENV', '').startswith('standard'):
    app.config.from_object(ProductionConfig)
else:
    app.config.from_object(DevelopmentConfig)

# Define allowed origins
ALLOWED_ORIGINS = [
    "http://localhost:3000", 
    "https://mappie-talkie-frontend-245835075814.us-central1.run.app"
]

# Simplified CORS setup
CORS(app, 
     origins=ALLOWED_ORIGINS,
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization", "Origin", "Accept"],
     methods=["GET", "POST", "OPTIONS"])

@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    
    # If the origin is in our allowed list, set the CORS headers
    if origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Origin, Accept'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
    
    # For OPTIONS requests, return immediately
    if request.method == 'OPTIONS':
        return response
        
    return response

@app.route('/')
def index():
    return jsonify({"message": "Hello, World!"}), 200

@app.route('/test')
def test():
    return jsonify({"message": "API is working"}), 200

@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'environment': os.getenv('FLASK_ENV', 'not_set'),
        'version': '1.0'
    })

# Register blueprints
app.register_blueprint(api, url_prefix='/api')
app.register_blueprint(test_bp)
app.register_blueprint(log_bp, url_prefix='/api')

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
