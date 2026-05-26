# config.py
import os
from dotenv import load_dotenv

# Load environment variables from .env file in project root
load_dotenv(dotenv_path='../.env', override=True)

class Config:
    DEBUG = False
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')
    DATABASE_PATH = 'database/spatial-db.db'
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

class ProductionConfig(Config):
    DEBUG = False

class DevelopmentConfig(Config):
    DEBUG = True