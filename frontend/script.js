// script.js
const state = {
    isInterviewing: false,
    isRecording: false,
    isProcessingAnswer: false,
    isQuestionPlaying: false,
    isOffline: false,
    mediaRecorder: null,
    mediaStream: null,
    chunks: [],
    remainingTime: 0,
    interviewSession: null,
    timer: null,
    recordingTimer: null,
    recordingTimeElapsed: 0,
    recordingDuration: {
      warning: 25,
      max: 30
    },
    loadingStates: {
      startingInterview: false,
      fetchingQuestion: false,
      submittingAnswer: false,
      endingInterview: false
    },
    retryAttempts: {
      maxRetries: 3,
      retryDelay: 2000
    }
};

// Utility Functions
const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const setLoading = (action, isLoading) => {
    state.loadingStates[action] = isLoading;
    updateLoadingUI();
};

const updateLoadingUI = () => {
    const startBtn = document.getElementById('start-btn');
    const recordBtn = document.getElementById('record-btn');
    const restartBtn = document.getElementById('restart-btn');

    startBtn.disabled = state.loadingStates.startingInterview || state.isOffline;
    recordBtn.disabled = state.loadingStates.fetchingQuestion || 
                        state.loadingStates.submittingAnswer || 
                        state.isOffline || 
                        !state.isInterviewing;
    restartBtn.disabled = state.loadingStates.endingInterview;

    Object.entries(state.loadingStates).forEach(([action, isLoading]) => {
        const loader = document.getElementById(`${action}-loader`);
        if (loader) {
            loader.style.display = isLoading ? 'block' : 'none';
        }
    });
};

// Audio Wave Animations
function updateAudioWave(isPlaying) {
    const wave = document.getElementById('audio-wave');
    wave.classList.toggle('playing', isPlaying);
}

function updateRecordingWave(isRecording) {
    const wave = document.getElementById('recording-wave');
    wave.style.display = isRecording ? 'flex' : 'none';
    wave.classList.toggle('recording', isRecording);
}

// Celebration Animation
function createConfetti() {
    const celebration = document.getElementById('celebration');
    celebration.innerHTML = ''; // Clear any existing confetti

    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 80%, 50%)`;
        confetti.style.animation = 'confetti-fall 3s ease-out forwards';
        celebration.appendChild(confetti);
        
        // Remove confetti after animation
        setTimeout(() => confetti.remove(), 3000);
    }
}

const updateUIState = (recording) => {
    const recordBtn = document.getElementById('record-btn');
    recordBtn.innerText = recording ? 'Stop Recording' : 'Record Answer';
    recordBtn.disabled = state.isProcessingAnswer || !state.isInterviewing;
    document.getElementById('status').innerText = recording ? 'Recording...' : '';
    updateRecordingWave(recording);
};

const updateTimerDisplay = () => {
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.textContent = formatTime(state.remainingTime);
    
    if (state.remainingTime < 60) {
        timerDisplay.classList.add('time-warning');
    }
};

const updateRecordingTimer = () => {
    const recordingTime = document.getElementById('recording-time');
    if (recordingTime) {
        recordingTime.textContent = formatTime(state.recordingTimeElapsed);
        
        if (state.recordingTimeElapsed >= state.recordingDuration.warning) {
            recordingTime.classList.add('time-warning');
        } else {
            recordingTime.classList.remove('time-warning');
        }
    }
};

const cleanupMedia = () => {
    if (state.recordingTimer) {
        clearInterval(state.recordingTimer);
        state.recordingTimer = null;
    }
    
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
    }
    
    if (state.mediaRecorder) {
        state.mediaRecorder = null;
    }
    
    state.chunks = [];
    state.recordingTimeElapsed = 0;
    updateRecordingTimer();
};

const stopAllAudio = () => {
    const audioElement = document.getElementById('question-audio');
    audioElement.pause();
    audioElement.currentTime = 0;
    state.isQuestionPlaying = false;
    updateAudioWave(false);
};

const handleOfflineStatus = () => {
    state.isOffline = !navigator.onLine;
    const offlineBar = document.getElementById('offline-bar');
    offlineBar.style.display = state.isOffline ? 'block' : 'none';
    updateLoadingUI();
};

const retryOperation = async (operation, actionName) => {
    let attempts = 0;
    
    while (attempts < state.retryAttempts.maxRetries) {
        try {
            return await operation();
        } catch (error) {
            attempts++;
            console.warn(`${actionName} failed, attempt ${attempts} of ${state.retryAttempts.maxRetries}`);
            
            if (attempts === state.retryAttempts.maxRetries) {
                throw error;
            }
            
            await new Promise(resolve => 
                setTimeout(resolve, state.retryAttempts.retryDelay * attempts)
            );
        }
    }
};

// Main Functions
async function startInterview() {
    if (state.loadingStates.startingInterview) return;
    
    const jobRole = document.getElementById('job-role').value.trim();
    const duration = parseInt(document.getElementById('duration').value);

    if (!jobRole || !duration || duration < 1 || duration > 60) {
        alert('Please enter a valid job role and duration (1-60 minutes).');
        return;
    }

    setLoading('startingInterview', true);

    try {
        const sessionData = await retryOperation(
            async () => {
                const response = await fetch('/api/start-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobRole, duration })
                });
                
                if (!response.ok) throw new Error('Failed to start session');
                return response.json();
            },
            'Starting interview'
        );

        state.interviewSession = sessionData;
        state.isInterviewing = true;
        state.remainingTime = duration * 60;

        document.getElementById('setup').style.display = 'none';
        document.getElementById('interview').style.display = 'block';
        
        updateTimer();

        // Play the initial session audio first
        const audioElement = document.getElementById('question-audio');
        audioElement.src = sessionData.audioUrl;
        audioElement.onplay = () => { 
            state.isQuestionPlaying = true;
            updateAudioWave(true);
        };
        audioElement.onpause = () => {
            state.isQuestionPlaying = false;
            updateAudioWave(false);
        };
        audioElement.onended = () => { 
            state.isQuestionPlaying = false;
            updateAudioWave(false);
        };
        audioElement.onerror = () => {
            console.error('Error playing initial audio');
            state.isQuestionPlaying = false;
            updateAudioWave(false);
            // In case of error, still proceed to next question
            getNextQuestion();
        };
        
        await audioElement.play();
    } catch (err) {
        console.error('Error starting session:', err);
        alert('Failed to start interview session after multiple attempts. Please try again.');
    } finally {
        setLoading('startingInterview', false);
    }
}

async function getNextQuestion() {
    if (!state.isInterviewing) return;

    setLoading('fetchingQuestion', true);

    try {
        stopAllAudio();
        
        const response = await retryOperation(
            async () => {
                const res = await fetch(`/api/next-question?sessionId=${state.interviewSession.sessionId}`);
                if (!res.ok) throw new Error('Failed to fetch question');
                return res.json();
            },
            'Fetching question'
        );

        const audioElement = document.getElementById('question-audio');
        audioElement.src = response.audioUrl;
        audioElement.onplay = () => { 
            state.isQuestionPlaying = true;
            updateAudioWave(true);
        };
        audioElement.onpause = () => {
            state.isQuestionPlaying = false;
            updateAudioWave(false);
        };
        audioElement.onended = () => { 
            state.isQuestionPlaying = false;
            updateAudioWave(false);
        };
        audioElement.onerror = () => {
            console.error('Error playing question audio');
            state.isQuestionPlaying = false;
            updateAudioWave(false);
        };
        
        await audioElement.play();
    } catch (err) {
        console.error('Error fetching next question:', err);
        alert('Failed to load next question. Please try again.');
    } finally {
        setLoading('fetchingQuestion', false);
    }
}

async function toggleRecording() {
    if (state.isProcessingAnswer) return;
    
    if (state.isRecording) {
        stopRecording();
    } else {
        if (state.isQuestionPlaying) {
            alert('Please wait for the question to finish playing.');
            return;
        }
        await startRecording();
    }
}

async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('Audio recording is not supported in this browser.');
        return;
    }

    try {
        cleanupMedia();
        state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(state.mediaStream);
        
        state.mediaRecorder.ondataavailable = (e) => state.chunks.push(e.data);
        state.mediaRecorder.onstop = handleRecordingStop;
        
        state.mediaRecorder.start();
        state.isRecording = true;
        state.recordingTimeElapsed = 0;
        updateUIState(true);
        startRecordingTimer();

    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone. Please check permissions.');
        cleanupMedia();
    }
}

function startRecordingTimer() {
    if (state.recordingTimer) {
        clearInterval(state.recordingTimer);
    }

    state.recordingTimer = setInterval(() => {
        state.recordingTimeElapsed++;
        updateRecordingTimer();

        if (state.recordingTimeElapsed === state.recordingDuration.warning) {
            showRecordingWarning();
        }

        if (state.recordingTimeElapsed >= state.recordingDuration.max) {
            showRecordingMaxTimeReached();
            stopRecording();
        }
    }, 1000);
}

function showRecordingWarning() {
    const warningSeconds = state.recordingDuration.max - state.recordingDuration.warning;
    const warningMessage = document.getElementById('recording-warning');
    if (warningMessage) {
        warningMessage.textContent = `Recording will automatically stop in ${warningSeconds} seconds`;
        warningMessage.style.display = 'block';
    }
}

function showRecordingMaxTimeReached() {
    const warningMessage = document.getElementById('recording-warning');
    if (warningMessage) {
        warningMessage.textContent = 'Maximum recording time reached';
    }
}

function stopRecording() {
    if (state.recordingTimer) {
        clearInterval(state.recordingTimer);
        state.recordingTimer = null;
    }

    if (state.mediaRecorder?.state === 'recording') {
        state.mediaRecorder.stop();
    }

    const warningMessage = document.getElementById('recording-warning');
    if (warningMessage) {
        warningMessage.style.display = 'none';
    }
}

async function handleRecordingStop() {
    state.isRecording = false;
    state.isProcessingAnswer = true;
    updateUIState(false);

    try {
        const blob = new Blob(state.chunks, { 'type': 'audio/webm; codecs=opus' });
        const formData = new FormData();
        formData.append('audio', blob, 'answer.webm');
        formData.append('sessionId', state.interviewSession.sessionId);

        const response = await retryOperation(
            async () => {
                const res = await fetch('/api/submit-answer', {
                    method: 'POST',
                    body: formData
                });
                if (!res.ok) throw new Error('Failed to submit answer');
                return res.json();
            },
            'Submitting answer'
        );

        if (state.isInterviewing && state.remainingTime > 0) {
            await getNextQuestion();
        } else {
            await endInterview();
        }
    } catch (err) {
        console.error('Error submitting answer:', err);
        alert('Failed to submit answer. Please try again.');
    } finally {
        cleanupMedia();
        state.isProcessingAnswer = false;
        updateUIState(false);
    }
}

function updateTimer() {
    if (state.timer) clearTimeout(state.timer);
    
    if (state.remainingTime > 0 && state.isInterviewing) {
        state.remainingTime--;
        updateTimerDisplay();
        state.timer = setTimeout(updateTimer, 1000);
    } else {
        forceEndInterview();
    }
}

async function forceEndInterview() {
    state.isInterviewing = false;
    stopAllAudio();
    cleanupMedia();
    
    if (state.isRecording) {
        stopRecording();
    }
    
    await endInterview();
}

async function endInterview() {
    setLoading('endingInterview', true);

    try {
        const response = await retryOperation(
            async () => {
                const res = await fetch(`/api/end-interview?sessionId=${state.interviewSession.sessionId}`);
                if (!res.ok) throw new Error('Failed to end interview');
                return res.json();
            },
            'Ending interview'
        );
        
        document.getElementById('interview').style.display = 'none';
        document.getElementById('result').style.display = 'block';
        
        document.getElementById('outcome').innerText = response.passed ? 'Congratulations! You Passed!' : 'Interview Completed';
        document.getElementById('feedback').innerHTML = marked.parse(response.feedback);
        
        if (response.passed) {
            createConfetti();
        }
        
    } catch (err) {
        console.error('Error ending interview:', err);
        alert('Failed to retrieve interview results.');
    } finally {
        cleanupMedia();
        stopAllAudio();
        if (state.timer) clearTimeout(state.timer);
        state.isInterviewing = false;
        state.isRecording = false;
        state.isProcessingAnswer = false;
        setLoading('endingInterview', false);
    }
}

// Event Listeners
document.getElementById('start-btn').addEventListener('click', startInterview);
document.getElementById('record-btn').addEventListener('click', toggleRecording);
document.getElementById('restart-btn').addEventListener('click', () => location.reload());

window.addEventListener('online', handleOfflineStatus);
window.addEventListener('offline', handleOfflineStatus);

window.addEventListener('beforeunload', (e) => {
    if (state.isInterviewing) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Initialize
handleOfflineStatus();