# InterviewGym: AI Interview Practice

InterviewGym is an open-source platform designed to help you prepare for interviews with AI-driven practice sessions. Get personalized feedback and sharpen your skills to ace your next interview!

---

## Features

- AI-powered interview questions tailored to your job role.
- Voice-to-text integration for real-time feedback.
- Multilingual support for diverse users.
- Easy setup using Docker Compose.

---

## Prerequisites

Before you get started, ensure you have:

1. **Docker** and **Docker Compose** installed on your machine.
2. API keys for the following services:
   - **OpenAI**: [Get your API Key](https://platform.openai.com/signup/).
   - **Deepgram**: [Sign up for Deepgram](https://console.deepgram.com/signup/).

---

## Setup Instructions

### Step 1: Clone the Repository

```bash
git clone https://github.com/abdulmunimjemal/InterviewGym.git
cd InterviewGym
```

### Step 2: Configure Environment Variables

1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Create a `.env` file in the `backend` folder and fill in your API keys:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   DEEPGRAM_API_KEY=your_deepgram_api_key_here
   ```

### Step 3: Build and Start the Application

Run the following command from the root directory:

```bash
docker-compose up --build
```

This will build and start all necessary services for the application.

---

## Usage

Once the application is running:

1. Open your browser and navigate to `http://localhost:8000`.
2. Start practicing your interview skills!

---

## Contributing

We welcome contributions to make InterviewGym even better! To contribute:

1. Fork the repository.
2. Create a new branch: `git checkout -b feature/your-feature-name`.
3. Commit your changes: `git commit -m 'Add your feature'`.
4. Push to the branch: `git push origin feature/your-feature-name`.
5. Open a Pull Request.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Support

For issues, feedback, or feature requests, please open an [issue](https://github.com/abdulmunimjemal/InterviewGym/issues).

---

Happy practicing! 🎉