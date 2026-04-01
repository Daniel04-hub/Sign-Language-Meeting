\# Sign Language Meeting

\## 1. Project Title

Sign Language Meeting (SignMeet)

\## 2. Description

SignMeet is a real-time web meeting application designed to improve accessibility between signing and speaking participants. It combines peer-to-peer video calling with live speech captions and an in-browser sign recognition pipeline.

\## 3. Features

- Create and join meeting rooms via a REST API
- Peer-to-peer video and audio using WebRTC
- Real-time signaling and room events over WebSockets (Django Channels)
- Live speech-to-text captions using the Web Speech API, broadcast to participants
- In-browser sign recognition: MediaPipe Hands landmarks (63 features) classified by a TensorFlow.js model
- Optional text-to-speech playback for detected signs (frontend)

\## 4. Tech Stack (Backend, Frontend, AI/ML)

\### Backend

- Django 4.2, Django REST Framework
- Django Channels (WebSockets), Daphne (ASGI)
- PostgreSQL (default), optional Redis channel layer for production

\### Frontend

- React + Vite
- WebRTC for media transport
- Web Speech API for captions

\### AI/ML

- MediaPipe Hands for landmark extraction
- TensorFlow.js for in-browser inference
- Python training utilities (scikit-learn MLP + StandardScaler + LabelEncoder) exporting `model.json`, `weights.bin`, `scaler.json`, and `label_encoder.json`

\## 5. Architecture Overview (brief)

- React frontend captures camera frames, extracts hand landmarks using MediaPipe Hands, normalizes features using exported scaler parameters, and runs TF.js inference in the browser.
- WebRTC provides peer-to-peer media streams; the Django Channels WebSocket handles signaling (offer/answer/ICE) and broadcasts captions and sign-detected events.
- Django REST API manages room lifecycle (create, join, detail) and provides a health endpoint.

\## 6. Setup Instructions (backend + frontend)

\### Option A: Use the PowerShell startup script (Windows)

From the project root:

```powershell
pwsh -File ".\signmeet\start.ps1"
```

If PowerShell 7 is not available:

```powershell
powershell -ExecutionPolicy Bypass -File ".\signmeet\start.ps1"
```

\### Option B: Manual setup

\#### Backend

Prerequisites: Python 3.x and a PostgreSQL instance (or set `USE_SQLITE=True`).

```powershell
cd .\signmeet\backend
python -m venv ..\..\.venv
..\..\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000
```

Configuration: create `signmeet\backend\.env` with values such as `SECRET_KEY`, `DEBUG`, and database settings (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`).

\#### Frontend

Prerequisites: Node.js (npm).

```powershell
cd .\signmeet\frontend
npm install
npm run dev
```

\## 7. Usage

1. Start backend and frontend.
2. Open `http://localhost:5173`.
3. Create a room in one tab and join from another tab using the room code.
4. Allow camera and microphone access.
5. Enable captions and sign mode from the in-call controls.

\## 8. Project Status

Active development. Core room management, WebSocket signaling, and WebRTC calling are implemented. AI sign detection is functional but under ongoing tuning and validation.

\## 9. Current Challenges

- Sign recognition accuracy depends on strict alignment between training-time preprocessing and frontend inference (feature scaling, label mapping, and capture conditions).
- Model outputs may vary by dataset (phrase model versus alphabet model); maintaining consistent label encodings across versions is critical.
- WebSocket room registry is in-memory for development and is not suitable for multi-process deployments without moving state to Redis or the database.
- Cross-browser variability in Web Speech API support and permissions.

\## 10. Future Improvements

- Expand and validate sign datasets; add model versioning and calibration tooling.
- Improve robustness of inference gating and UX feedback (confidence, hand presence, stability).
- Persist room membership state in Redis/database for production scaling.
- Add authentication and stronger abuse protections for public deployments.

\## 11. License (MIT)

This project is licensed under the MIT License. See LICENSE.
