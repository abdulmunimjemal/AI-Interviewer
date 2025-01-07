# main.py
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import redis
import uuid
import json
import os
from datetime import timedelta
from services.tts_service import synthesize_text
from services.stt_service import transcribe_audio
from openai import OpenAI
import aiofiles
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import List, Dict, Optional

# Load environment variables
load_dotenv()

# Initialize OpenAI API
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Initialize FastAPI app
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Redis
redis_host = os.getenv('REDIS_HOST', 'localhost')
redis_port = int(os.getenv('REDIS_PORT', 6379))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=0)

# Create directories
os.makedirs('audio', exist_ok=True)
os.makedirs('uploads', exist_ok=True)

# Constants
ALLOWED_EXTENSIONS = {'webm', 'wav', 'mp3', 'ogg'}

INTERVIEW_PROMPTS = {
    "initial": """
    Context: You work for Dallol AI, You are Sarah, Dallol AI's Interviewer.


    You are an interviewer assessing a candidate for a {role} position. 
    Start the conversation by:
    1. Briefly introducing yourself (name, role, and company).
    2. Explaining the purpose of the interview (to assess fit for the {role}). then,
    3. Asking the candidate to summarize their background, skills, and most relevant experiences for this role.
    
    Keep your response friendly, professional, and UNDER 3 sentences. Use clear and simple language to ensure comprehension.
    """,
    
    "follow_up": """
    MUST BE IN 3-4 SENTENCES EXCEPT WHEN ABSOLUTETLY NECESSARY. Feel free to use humanistic language and uhh and umm as you would in a real conversation.

    You are continuing an interview for a {role} position. 
    Based on the candidate's last response, craft a follow-up question that:
    1. Explores their expertise in a technical area or specific skill required for the role.
    2. Digs deeper into a project, challenge, or experience they mentioned.
    3. Assesses their problem-solving abilities or decision-making process.

    Frame the question in a conversational tone. Keep it concise and avoid ambiguity. Assume the candidate may make minor spelling or grammar errors but focus on the content of their responses.
    """,
    
    "assessment": """
    You are evaluating a completed interview for a {role} position. 
    The conversation transcript is provided below:

    {conversation}

    Your task is to provide a detailed assessment by addressing the following:
    1. Identify and list the 10 most critical criteria for success in the {role}.
    2. Score the candidate's performance on each criterion (1 = Poor, 5 = Excellent).
    3. Highlight 2-3 key strengths with specific examples from the conversation.
    4. Identify 3-4 areas where the candidate could improve, providing actionable feedback.
    5. Give a final recommendation (Hire/No Hire), supported by a clear and concise explanation (maximum 2 sentences).

    Use the STAR method (Situation, Task, Action, Result) to structure your assessment of the candidate's examples and answers. Be systematic and avoid personal bias.
    """
}


# Models
class StartSessionRequest(BaseModel):
    jobRole: str
    duration: int

class InterviewMessage:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content

    def to_dict(self):
        return {
            "role": self.role,
            "content": self.content
        }

class Session:
    def __init__(self, job_role: str, duration: int):
        self.job_role = job_role
        self.duration = duration
        self.messages: List[InterviewMessage] = []
        self.start_time = None

    def add_message(self, role: str, content: str):
        self.messages.append(InterviewMessage(role, content))

    def get_conversation_history(self):
        return [msg.to_dict() for msg in self.messages]

    @classmethod
    def from_dict(cls, data: Dict):
        session = cls(data['job_role'], data['duration'])
        session.start_time = data.get('start_time')
        for msg in data.get('messages', []):
            session.add_message(msg['role'], msg['content'])
        return session

    def to_dict(self):
        return {
            'job_role': self.job_role,
            'duration': self.duration,
            'start_time': self.start_time,
            'messages': [msg.to_dict() for msg in self.messages]
        }

# Utility functions
def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# API Endpoints
@app.post("/start-session")
async def start_session(request: StartSessionRequest):
    session_id = str(uuid.uuid4())
    session = Session(request.jobRole, request.duration)
    
    # Generate initial question
    initial_prompt = INTERVIEW_PROMPTS["initial"].format(role=request.jobRole)
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "system", "content": initial_prompt}],
    )
    
    initial_question = response.choices[0].message.content
    session.add_message("system", initial_question)
    
    # Store session
    redis_client.setex(
        session_id, 
        timedelta(minutes=request.duration), 
        json.dumps(session.to_dict())
    )
    
    # Generate audio for initial question
    audio_filename = f"question-{uuid.uuid4()}.mp3"
    audio_filepath = os.path.join('audio', audio_filename)
    synthesize_text(initial_question, audio_filepath)
    
    return {
        'sessionId': session_id,
        'audioUrl': f"/audio/{audio_filename}"
    }

@app.post("/submit-answer")
async def submit_answer(
    sessionId: str = Form(...),
    audio: UploadFile = File(...),
):
    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail='Invalid audio file format')
    
    # Save uploaded audio
    filename = f"{uuid.uuid4()}_{audio.filename}"
    filepath = os.path.join('uploads', filename)
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await audio.read()
        await out_file.write(content)
    
    # Get session
    session_data = redis_client.get(sessionId)
    if not session_data:
        os.remove(filepath)
        raise HTTPException(status_code=404, detail='Session not found or expired')
    
    session = Session.from_dict(json.loads(session_data))
    
    # Transcribe audio
    transcription = transcribe_audio(filepath)
    os.remove(filepath)
    
    # Add answer to session
    session.add_message("user", transcription)
    
    # Update session in Redis
    redis_client.setex(
        sessionId,
        timedelta(minutes=session.duration),
        json.dumps(session.to_dict())
    )
    
    return {'success': True}

@app.get("/next-question")
async def next_question(sessionId: str):
    session_data = redis_client.get(sessionId)
    if not session_data:
        raise HTTPException(status_code=404, detail='Session not found or expired')
    
    session = Session.from_dict(json.loads(session_data))

    # Generate follow-up question
    messages = [{"role": "system", "content": INTERVIEW_PROMPTS["follow_up"].format(role=session.job_role)}]
    messages.extend(session.get_conversation_history())
    
    response = client.chat.completions.create(
        model="gpt-4",
        messages=messages,
    )
    
    question = response.choices[0].message.content
    session.add_message("system", question)
    
    # Generate audio
    audio_filename = f"question-{uuid.uuid4()}.mp3"
    audio_filepath = os.path.join('audio', audio_filename)
    synthesize_text(question, audio_filepath)
    
    # Update session
    redis_client.setex(
        sessionId,
        timedelta(minutes=session.duration),
        json.dumps(session.to_dict())
    )
    
    return {'audioUrl': f"/audio/{audio_filename}"}

@app.get("/end-interview")
async def end_interview(sessionId: str):
    session_data = redis_client.get(sessionId)
    if not session_data:
        raise HTTPException(status_code=404, detail='Session not found or expired')
    
    session = Session.from_dict(json.loads(session_data))
    
    # Format conversation
    conversation = "\n".join([
        f"{'Interviewer' if msg.role == 'system' else 'Candidate'}: {msg.content}"
        for msg in session.messages
    ])
    
    # Generate assessment
    assessment_prompt = INTERVIEW_PROMPTS["assessment"].format(
        role=session.job_role,
        conversation=conversation
    )
    
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "system", "content": assessment_prompt}],
    )
    
    assessment = response.choices[0].message.content
    passed = not "no hire" in assessment.lower()
    
    return {
        'passed': passed,
        'feedback': assessment
    }

@app.get("/audio/{filename}")
async def serve_audio(filename: str):
    file_path = os.path.join('audio', filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail='Audio file not found')
    return FileResponse(file_path, media_type='audio/mpeg')