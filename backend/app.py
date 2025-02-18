# app.py 
from flask import Flask
from flask_cors import CORS
from routes.api import api
from config import DevelopmentConfig

# Create the Flask app instance
app = Flask(__name__)

# Apply the configuration
app.config.from_object(DevelopmentConfig)

# Enable CORS for all routes with proper configuration
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

@app.route('/')
def index():
    return 'Hello, World!'

# Register blueprints
app.register_blueprint(api, url_prefix='/')

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
