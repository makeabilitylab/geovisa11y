# config.py

class Config:
    DEBUG = True
    CORS_ORIGINS = "http://localhost:3000"
    DATABASE_PATH = 'database/spatial-db.db'

class ProductionConfig(Config):
    DEBUG = False

class DevelopmentConfig(Config):
    DEBUG = True
    OPENAI_API_KEY = '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'
    pass