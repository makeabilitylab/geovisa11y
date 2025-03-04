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

# CORS configuration with explicit options
CORS(app, 
    resources={
        r"/logs": {  # Specific rule for /logs endpoint
            "origins": ["http://localhost:3000", "https://mappie-talkie-frontend-245835075814.us-central1.run.app"],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Origin", "Accept"],
            "supports_credentials": True,
            "expose_headers": ["Access-Control-Allow-Credentials"],
            "send_wildcard": False
        },
        r"/api/*": {  # Rule for API endpoints
            "origins": ["http://localhost:3000", "https://mappie-talkie-frontend-245835075814.us-central1.run.app"],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Origin", "Accept"],
            "supports_credentials": True,
            "expose_headers": ["Access-Control-Allow-Credentials"],
            "send_wildcard": False
        },
        r"/*": {  # Fallback rule for all other routes
            "origins": ["http://localhost:3000", "https://mappie-talkie-frontend-245835075814.us-central1.run.app"],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Origin", "Accept"],
            "supports_credentials": True,
            "expose_headers": ["Access-Control-Allow-Credentials"],
            "send_wildcard": False
        }
    })

@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    allowed_origins = ["http://localhost:3000", "https://mappie-talkie-frontend-245835075814.us-central1.run.app"]
    
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Origin, Accept'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
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
app.register_blueprint(log_bp)

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
