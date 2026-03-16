# Sign Language Meeting

Real-time video calls with Indian Sign Language AI detection.
Built for the Deaf community.

## What It Does
- Deaf user signs → Hearing user hears it (Text-to-Speech)
- Hearing user speaks → Deaf user sees captions (28px overlay)
- Real-time P2P video via WebRTC (up to 8 users)
- 5 ISL signs detected: HELLO, THANKS, BYE, YES, NO

## Tech Stack

| Layer     | Technology                                    |
|-----------|-----------------------------------------------|
| Backend   | Django 4.2 + Django Channels + PostgreSQL     |
| Frontend  | React 18 + Vite + Bootstrap 5.3              |
| AI/ML     | MediaPipe Hands + TensorFlow.js (in browser) |
| Real-time | WebRTC P2P + Django Channels WebSockets       |
| Deploy    | Render.com free tier + Docker                 |

## Quick Start

Backend:
	cd backend
	python -m venv venv
	venv\Scripts\activate
	pip install -r requirements.txt
	cp ../.env.example .env
	python manage.py migrate
	python manage.py runserver

Frontend:
	cd frontend
	npm install
	npm run dev

Train AI Model (optional):
	cd train_model
	pip install -r requirements.txt
	python train.py

## How It Works

### Deaf User Signs Flow
1. Deaf user enables Sign Mode
2. MediaPipe captures hand from camera at 10fps
3. 21 landmarks extracted (63 float values)
4. StandardScaler normalizes the values
5. TF.js MLP model predicts sign + confidence
6. If confidence above 85 percent: sign detected
7. WebSocket sends sign-detected to Django
8. Django Channels broadcasts to all room members
9. Hearing users hear TTS: "Hello there"
10. All users see green badge on deaf user video tile

### Hearing User Speaks Flow
1. Hearing user enables Captions (CC button)
2. Web Speech API captures microphone audio
3. Interim text sent via WebSocket as user speaks
4. Final text sent when user pauses
5. Django Channels broadcasts to all room members
6. Deaf user sees large 28px caption overlay
7. Caption shows: "Alice: Hello, can you hear me?"
8. Caption auto-clears after 6 seconds

## Build Progress

| Phase | Status      | Description                     |
|-------|-------------|---------------------------------|
| 1     | Complete    | Django + PostgreSQL + WebSockets|
| 2     | In Progress | React + WebRTC Video            |
| 3     | Pending     | Sign Language AI                |
| 4     | Pending     | Speech Recognition + Captions   |
| 5     | Pending     | UI Polish + Error Handling      |
| 6     | Pending     | Docker + Render Deployment      |

## API Endpoints

| Method | Endpoint              | Description      |
|--------|-----------------------|------------------|
| GET    | /api/health/          | Health check     |
| POST   | /api/rooms/create/    | Create new room  |
| POST   | /api/rooms/join/      | Join a room      |
| GET    | /api/rooms/{code}/    | Get room details |

## CI/CD
Every push to main runs:
- Django tests and migration checks
- React build verification
- AI model dependency validation
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
