# Production Dockerfile for Autonomous Affiliate Marketing Suite
FROM python:3.11-slim

# Prevent Python from writing .pyc and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    PORT=5000 \
    SQLITE_DB_PATH=/var/data/affiliate.db

# Install essential system dependencies, graphic/video libraries, and headless Chromium prerequisites
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium and system dependencies
RUN playwright install chromium --with-deps

# Create persistent storage directory
RUN mkdir -p /var/data && chmod 777 /var/data

# Copy source application
COPY . .

EXPOSE 5000

# Run Gunicorn with gevent worker for asynchronous link redirection and webhook streaming
CMD ["gunicorn", "--worker-class", "gevent", "--workers", "2", "--bind", "0.0.0.0:5000", "--timeout", "120", "app:app"]
