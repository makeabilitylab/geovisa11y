# config.py
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    DEBUG = False
    # Define CORS_ORIGINS as a list directly
    CORS_ORIGINS = [
        "http://localhost:3000",
        "https://mappie-talkie.web.app",
        "https://mappie-talkie-api-245835075814.us-central1.run.app"
    ]
    DATABASE_PATH = 'database/spatial-db.db'
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

class ProductionConfig(Config):
    DEBUG = False

class DevelopmentConfig(Config):
    DEBUG = True