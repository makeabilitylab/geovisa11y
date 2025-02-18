# Use Python 3.10 slim image
FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libgeos-dev \
    gdal-bin \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the database file first
COPY database ./database/

# Copy the rest of the application
COPY . .

# Create a non-root user
RUN useradd -m myuser
USER myuser

# Set environment variables
ENV PORT=5000
ENV PYTHONUNBUFFERED=1

# Run the application with increased timeout
CMD exec gunicorn --bind :$PORT app:app --workers 1 --threads 8 --timeout 120 --max-requests 1000