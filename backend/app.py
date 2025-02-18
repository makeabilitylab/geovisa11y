# app.py 
import os
from flask import Flask, jsonify
from flask_cors import CORS
from routes.api import api
from routes.test_routes import test_bp
from config import DevelopmentConfig, ProductionConfig

# Create the Flask app instance
app = Flask(__name__)

# Determine environment and apply configuration
if os.getenv('GAE_ENV', '').startswith('standard'):
    # Running on GAE
    app.config.from_object(ProductionConfig)
else:
    # Local development
    app.config.from_object(DevelopmentConfig)

# Enable CORS
CORS(app, resources={
    r"/*": {
        "origins": app.config['CORS_ORIGINS'],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

@app.route('/')
def index():
    return jsonify({"message": "Hello, World!"}), 200

@app.route('/test')
def test():
    return jsonify({"message": "API is working"}), 200

# Register blueprints
app.register_blueprint(api, url_prefix='/api')
app.register_blueprint(test_bp)

if __name__ == '__main__':
    # Use PORT environment variable provided by Cloud Run
    port = int(os.getenv("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
