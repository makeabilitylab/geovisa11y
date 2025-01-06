# config.py

class Config:
    DEBUG = True
    CORS_ORIGINS = "http://localhost:3000"
    DATABASE_PATH = 'database/spatial-db.db'

class ProductionConfig(Config):
    DEBUG = False

class DevelopmentConfig(Config):
    DEBUG = True
    OPENAI_API_KEY = '***REDACTED***'
    pass