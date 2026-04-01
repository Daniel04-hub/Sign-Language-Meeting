# Sign Language Meeting (SignMeet)

## Description
SignMeet is a real-time web meeting application focused on accessibility between signing and speaking participants. It combines peer-to-peer video calling with live speech captions and in-browser sign recognition.

## Features
- Create and join meeting rooms via a REST API
- Peer-to-peer video and audio using WebRTC
- Real-time signaling and room events over WebSockets (Django Channels)
- Live speech-to-text captions using the Web Speech API and sharing them with participants
- In-browser sign recognition using MediaPipe Hands landmarks and a TensorFlow.js model
- Optional text-to-speech playback for detected signs

## Tech Stack
### Backend
- Django, Django REST Framework
- Django Channels (WebSockets) + Daphne (ASGI)
- PostgreSQL (default) with SQLite fallback for local development
- Optional Redis channel layer for production deployments

### Frontend
- React + Vite
- WebRTC for media transport
- Web Speech API for captions

### AI/ML
- MediaPipe Hands for hand landmark extraction
- TensorFlow.js for in-browser inference
- Python training utilities (scikit-learn) with exported scaler and label encoder used by the frontend

## Project Status
Active development. Core room management, signaling, and WebRTC calling are implemented. Sign detection is functional and under ongoing tuning and validation.

## Impact
Helps reduce communication barriers in live conversations by providing real-time captions and sign interpretation support, enabling more inclusive remote meetings for mixed signing and speaking participants.
