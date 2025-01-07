# services/tts_service.py
import requests
from dotenv import load_dotenv
import os

load_dotenv()

DEEPGRAM_URL = "https://api.deepgram.com/v1/speak?model=aura-orpheus-en"
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")

if not DEEPGRAM_API_KEY:
    raise ValueError("Please set the DEEPGRAM_API_KEY environment variable")

def synthesize_text(text, output_filename):
    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "text": text
    }

    response = requests.post(DEEPGRAM_URL, headers=headers, json=data)

    with open(output_filename, 'wb') as audio_file:
        audio_file.write(response.content)