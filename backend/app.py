# app.py 
from flask import Flask
from flask_cors import CORS
from routes.api import api
from config import DevelopmentConfig

# Create the Flask app instance
app = Flask(__name__)

# Apply the configuration
app.config.from_object(DevelopmentConfig)

# Enable CORS
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept"],
        "supports_credentials": True
    }
})

# Register blueprints
app.register_blueprint(api, url_prefix='/api')

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = 'http://localhost:3000'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Accept'
    print(f"Response headers: {response.headers}")
    return response

if __name__ == '__main__':
    app.run(debug=True)
