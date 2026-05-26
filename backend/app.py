# app.py
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path='../.env', override=True)

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

CORS(app,
     origins=app.config['CORS_ORIGINS'],
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization", "Origin", "Accept"],
     methods=["GET", "POST", "OPTIONS"])

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
