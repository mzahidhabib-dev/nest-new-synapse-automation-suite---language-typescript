FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download the spacy model needed by Presidio
RUN pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_lg-3.6.0/en_core_web_lg-3.6.0-py3-none-any.whl

# Copy application code
COPY . .

# Expose port
EXPOSE 8001

# Command to run
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
