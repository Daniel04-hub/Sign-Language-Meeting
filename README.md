# 🤟 SignMeet — Video Calls with Sign Language AI

> Zoom clone for the Deaf community with real-time sign language detection
> and live speech-to-text captions.

## What it does

| Who | Action | What the other person gets |
|-----|--------|---------------------------|
| Deaf user | Signs at camera | Hearing user **hears** the word (TTS) |
| Hearing user | Speaks | Deaf user **sees** live captions |

- Real-time P2P video via WebRTC (up to 8 participants)
- 5 sign classes: **HELLO, THANKS, BYE, YES, NO**
- Sign detection runs **entirely in the browser** — no video data leaves the device
- Room codes — share a link to invite anyone

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 4.2 + Django Channels 4 + Daphne |
| Database | PostgreSQL 18 |
| Realtime | WebSockets (Django Channels) |
| Frontend | React 18 + Vite 8 + Bootstrap 5.3 |
| AI | MediaPipe Hands + TensorFlow.js (in-browser) |
| Deployment | Render.com (free tier) |

## Project Structure

```
signmeet/
├── backend/                 ← Django project
│   ├── signmeet/            ← project settings, asgi, urls
│   └── video_call/          ← Room model, REST API, WebSocket consumer
├── frontend/                ← React + Vite app
│   ├── src/
│   │   ├── hooks/           ← useWebSocket, useWebRTC, useSignDetection
│   │   ├── components/      ← VideoTile, VideoGrid, ControlsBar, …
│   │   └── pages/           ← HomePage, RoomPage
│   └── public/model/        ← TF.js model files (generated — see train_model/)
├── train_model/             ← Python training script (MediaPipe → TF.js)
└── docker-compose.yml       ← Local dev stack (postgres + daphne + vite)
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 15+

### 1 — Clone

```bash
git clone https://github.com/YOUR_USERNAME/signmeet.git
cd signmeet
```

### 2 — Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv ../venv
# Windows
..\venv\Scripts\activate
# macOS / Linux
source ../venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp ../.env.example .env
# Edit .env — set DB_PASSWORD and generate a SECRET_KEY

# Create the database (PostgreSQL must be running)
createdb signmeet_db          # or use pgAdmin

# Run migrations
python manage.py migrate

# Start the development server
daphne -p 8000 signmeet.asgi:application
```

Backend is available at http://localhost:8000

### 3 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend is available at http://localhost:5173

### 4 — Test the full stack

1. Open http://localhost:5173
2. **Tab 1**: Create a meeting as "Alice"
3. **Tab 2**: Join the same room as "Bob" using the room code
4. Allow camera + microphone in both tabs
5. Click **🤟 Sign Mode OFF** to enable sign detection (mock mode fires random signs every 3 s before the real model is trained)

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/rooms/create/` | Create a room |
| POST | `/api/rooms/join/` | Join a room |
| GET | `/api/rooms/<room_code>/` | Room detail |
| GET | `/api/health/` | Health check |

## WebSocket Events

Connect: `ws://localhost:8000/ws/room/<ROOM_CODE>/`

| Direction | Type | Payload |
|-----------|------|---------|
| → server | `join` | `{room_code, user_id, user_name}` |
| ← server | `user-joined` | `{existing_users: [{user_id, user_name}]}` |
| ← server | `new-user` | `{user_id, user_name}` |
| → server | `webrtc-offer` | `{target_id, offer}` |
| → server | `webrtc-answer` | `{target_id, answer}` |
| → server | `ice-candidate` | `{target_id, candidate}` |
| → server | `sign-detected` | `{sign, confidence, user_id, user_name}` |
| → server | `speech-text` | `{text, is_final, user_id, user_name}` |
| → server | `leave` | `{}` |

## Training the Sign Model

Collect landmark data and train the TF.js classifier (see `train_model/README.md`):

```bash
cd train_model
python train.py
# Exports model.json + weights.bin → frontend/public/model/
```

Until the model is trained, **mock detection** activates automatically (random signs in dev).

## Running Tests

```bash
# Backend — 8 WebSocket integration tests
cd backend
python manage.py test video_call.tests

# Frontend
cd frontend
npm run build    # catches TypeScript / JSX compile errors
```

## CI / CD

GitHub Actions runs on every push and pull request:

- **backend-ci**: Installs deps, applies migrations against a PostgreSQL service container, runs the Django test suite
- **frontend-ci**: Installs npm deps, runs `npm run build`

See `.github/workflows/` for details.

## Deployment (Render.com)

1. Push to GitHub
2. Create a **Web Service** on Render for the backend (Python, `daphne signmeet.asgi:application`)
3. Create a **Static Site** for the frontend (`npm run build`, publish `dist/`)
4. Add a **PostgreSQL** database + **Redis** instance in Render dashboard
5. Set environment variables from `.env.example`

## Contributing

PRs welcome — especially additional sign classes, mobile UX improvements, and accessibility fixes.

## License

MIT
