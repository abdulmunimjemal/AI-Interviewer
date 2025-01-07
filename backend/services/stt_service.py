# services/stt_service.py
import speech_recognition as sr
import os
import subprocess
import uuid

def transcribe_audio(audio_file_path):
    # Convert WebM to WAV using ffmpeg
    temp_wav = f"{uuid.uuid4()}.wav"
    try:
        command = ["ffmpeg", "-i", audio_file_path, temp_wav]
        subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)

        r = sr.Recognizer()
        with sr.AudioFile(temp_wav) as source:
            audio_data = r.record(source)  # read the entire audio file
            try:
                transcription = r.recognize_google(audio_data)  # Using Google Web Speech API
                return transcription
            except sr.UnknownValueError:
                return ""
            except sr.RequestError as e:
                print(f"Could not request results from Speech Recognition service; {e}")
                return ""
    except subprocess.CalledProcessError as e:
        print(f"Error converting audio file: {e}")
        return ""
    finally:
        if os.path.exists(temp_wav):
            os.remove(temp_wav)