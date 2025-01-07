# Dockerfile
FROM python:3.8-slim

# Install ffmpeg and other dependencies
RUN apt-get update && apt-get install -y ffmpeg libasound-dev portaudio19-dev libportaudio2 libportaudiocpp0

# Set the working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Ensure the directories exist
RUN mkdir -p audio uploads

# Expose the port
EXPOSE 8000

# Set environment variables
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]