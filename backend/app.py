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
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})

# Register blueprints
app.register_blueprint(api, url_prefix='/api')

@app.after_request
def add_cors_headers(response):
    print(f"Response headers: {response.headers}")
    return response

if __name__ == '__main__':
    app.run(debug=True)
