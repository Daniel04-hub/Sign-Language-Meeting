/**
 * pages/HomePage.jsx
 *
 * Landing page — Create or Join a meeting.
 * Stores userName + userId in sessionStorage so RoomPage can read them.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

function HomePage() {
  const navigate = useNavigate();

  // ── shared state ──────────────────────────────────────────────
  const [error, setError] = useState('');

  // ── create-room form ──────────────────────────────────────────
  const [createName,   setCreateName]   = useState('');
  const [roomName,     setRoomName]     = useState('');
  const [isCreating,   setIsCreating]   = useState(false);

  // ── join-room form ────────────────────────────────────────────
  const [joinName,     setJoinName]     = useState('');
  const [joinCode,     setJoinCode]     = useState('');
  const [isJoining,    setIsJoining]    = useState(false);

  // ── helpers ───────────────────────────────────────────────────
  function saveSession(userName, roomCode) {
    sessionStorage.setItem('userName', userName.trim());
    sessionStorage.setItem('userId',   uuidv4());
    navigate(`/room/${roomCode}`);
  }

  // ── create ────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setError('');

    if (!createName.trim()) { setError('Enter your display name.'); return; }
    if (!roomName.trim())   { setError('Enter a room name.');       return; }

    setIsCreating(true);
    try {
      const { data } = await axios.post('/api/rooms/create/', {
        name: roomName.trim(),
      });
      saveSession(createName, data.room_code);
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.name?.[0] ||
        'Could not create room. Try again.';
      setError(msg);
    } finally {
      setIsCreating(false);
    }
  }

  // ── join ──────────────────────────────────────────────────────
  async function handleJoin(e) {
    e.preventDefault();
    setError('');

    if (!joinName.trim()) { setError('Enter your display name.'); return; }
    if (!joinCode.trim()) { setError('Enter the room code.');     return; }

    setIsJoining(true);
    try {
      const { data } = await axios.post('/api/rooms/join/', {
        room_code: joinCode.trim().toUpperCase(),
        user_name: joinName.trim(),
      });
      saveSession(joinName, data.room_code);
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.room_code?.[0] ||
        'Could not join room. Check the code and try again.';
      setError(msg);
    } finally {
      setIsJoining(false);
    }
  }

  // ── render ────────────────────────────────────────────────────
  return (
    <div className="home-page">
      <div className="container-fluid" style={{ maxWidth: 960 }}>

        {/* ── header ── */}
        <div className="text-center mb-5">
          <h1 className="display-4 fw-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            🤟 SignMeet
          </h1>
          <p className="lead" style={{ color: 'var(--text-secondary)' }}>
            Real-time video calls with bidirectional sign language translation
          </p>
        </div>

        {/* ── global error ── */}
        {error && (
          <div className="alert alert-danger text-center mb-4" role="alert">
            {error}
          </div>
        )}

        {/* ── two-column cards ── */}
        <div className="row g-4">

          {/* ── create card ── */}
          <div className="col-12 col-md-6">
            <div className="card h-100">
              <div className="card-body p-4">
                <h2 className="card-title mb-1" style={{ fontSize: 22 }}>
                  Create a Meeting
                </h2>
                <p className="card-text mb-4" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                  Start a new room and share the code with others.
                </p>

                <form onSubmit={handleCreate} noValidate>
                  <div className="mb-3">
                    <label htmlFor="create-name" className="form-label">
                      Your display name
                    </label>
                    <input
                      id="create-name"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Alice"
                      maxLength={50}
                      value={createName}
                      onChange={e => setCreateName(e.target.value)}
                      disabled={isCreating}
                    />
                  </div>

                  <div className="mb-4">
                    <label htmlFor="room-name" className="form-label">
                      Room name
                    </label>
                    <input
                      id="room-name"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Team standup"
                      maxLength={50}
                      value={roomName}
                      onChange={e => setRoomName(e.target.value)}
                      disabled={isCreating}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-100"
                    disabled={isCreating}
                  >
                    {isCreating
                      ? <LoadingSpinner size="sm" color="text-white" message="" />
                      : 'Create Room'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* ── join card ── */}
          <div className="col-12 col-md-6">
            <div className="card h-100">
              <div className="card-body p-4">
                <h2 className="card-title mb-1" style={{ fontSize: 22 }}>
                  Join a Meeting
                </h2>
                <p className="card-text mb-4" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                  Enter the room code shared by the host.
                </p>

                <form onSubmit={handleJoin} noValidate>
                  <div className="mb-3">
                    <label htmlFor="join-name" className="form-label">
                      Your display name
                    </label>
                    <input
                      id="join-name"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Bob"
                      maxLength={50}
                      value={joinName}
                      onChange={e => setJoinName(e.target.value)}
                      disabled={isJoining}
                    />
                  </div>

                  <div className="mb-4">
                    <label htmlFor="join-code" className="form-label">
                      Room code
                    </label>
                    <input
                      id="join-code"
                      type="text"
                      className="form-control"
                      placeholder="e.g. AB3XY9ZQ"
                      maxLength={8}
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      disabled={isJoining}
                      style={{ letterSpacing: 3, fontFamily: 'monospace', textTransform: 'uppercase' }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-success w-100"
                    disabled={isJoining}
                  >
                    {isJoining
                      ? <LoadingSpinner size="sm" color="text-white" message="" />
                      : 'Join Room'}
                  </button>
                </form>
              </div>
            </div>
          </div>

        </div>{/* row */}

        {/* ── footer note ── */}
        <p className="text-center mt-5" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Sign language detection runs entirely in your browser — no data is sent to any server.
        </p>

      </div>
    </div>
  );
}

export default HomePage;
