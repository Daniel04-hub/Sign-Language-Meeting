/**
 * pages/HomePage.jsx
 *
 * Landing page — Create or Join a meeting.
 * Stores userName + userId in sessionStorage so RoomPage can read them.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── shared state ──────────────────────────────────────────────
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');

  // ── create-room form ──────────────────────────────────────────
  const [createName,   setCreateName]   = useState('');
  const [roomName,     setRoomName]     = useState('');
  const [isCreating,   setIsCreating]   = useState(false);

  // ── join-room form ────────────────────────────────────────────
  const [joinName,     setJoinName]     = useState('');
  const [joinCode,     setJoinCode]     = useState('');
  const [isJoining,    setIsJoining]    = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsPageVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (location.state?.error) {
      setCreateError(location.state.error);
      window.history.replaceState({}, '', '/');
    }
  }, [location.state]);

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

    const sanitizedCode = joinCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const normalizedJoinName = joinName.trim();

    if (!normalizedJoinName) {
      setError('Enter your display name.');
      return;
    }
    if (normalizedJoinName.length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }
    if (!sanitizedCode) {
      setError('Enter the room code.');
      return;
    }
    if (sanitizedCode.length !== 8) {
      setError('Room code must be exactly 8 letters/numbers.');
      return;
    }

    setIsJoining(true);
    try {
      const { data } = await axios.post('/api/rooms/join/', {
        room_code: sanitizedCode,
        user_name: normalizedJoinName,
      });
      saveSession(joinName, data.room_code);
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.room_code?.[0] ||
        err.response?.data?.user_name?.[0] ||
        'Could not join room. Check the code and try again.';
      setError(msg);
    } finally {
      setIsJoining(false);
    }
  }

  // ── render ────────────────────────────────────────────────────
  return (
    <div className={`home-page ${isPageVisible ? 'page-enter-active' : 'page-enter'}`}>
      <div className="container-fluid" style={{ maxWidth: 960 }}>

        {/* ── header ── */}
        <div className="text-center mb-5">
          <h1 className="home-logo mb-2">
            Sign Language Meeting
          </h1>
          <p className="home-tagline">
            Real-time video calls with bidirectional sign language translation
          </p>
          <div className="d-flex flex-wrap justify-content-center gap-2 mt-2">
            <span className="badge" style={{ background: 'var(--accent-purple)', color: 'white', padding: '6px 10px' }}>Sign Language AI</span>
            <span className="badge" style={{ background: 'var(--accent-blue)', color: 'white', padding: '6px 10px' }}>Live Captions</span>
            <span className="badge" style={{ background: 'var(--accent-green)', color: 'white', padding: '6px 10px' }}>Free Forever</span>
          </div>
        </div>

        {/* ── global error ── */}
        {(createError || error) && (
          <div className="alert alert-danger text-center mb-4" role="alert">
            {createError || error}
          </div>
        )}

        {/* ── two-column cards ── */}
        <div className="row g-4 align-items-stretch">

          {/* ── create card ── */}
          <div className="col-12 col-md-6">
            <div className="card h-100">
              <div className="card-body p-4 home-card">
                <h2 className="home-card-title">
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
                      placeholder="Enter your name as others should see it"
                      maxLength={50}
                      value={createName}
                      onChange={e => setCreateName(e.target.value)}
                      disabled={isCreating}
                      style={{ transition: 'border-color 0.2s ease, box-shadow 0.2s ease' }}
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
                      placeholder="Name this meeting (for your reference)"
                      maxLength={50}
                      value={roomName}
                      onChange={e => setRoomName(e.target.value)}
                      disabled={isCreating}
                      style={{ transition: 'border-color 0.2s ease, box-shadow 0.2s ease' }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-100"
                    disabled={isCreating}
                    style={{ transition: 'all 0.2s ease' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
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
          <div className="col-12 d-md-none">
            <div className="divider-with-text">or</div>
          </div>

          <div className="col-12 col-md-6">
            <div className="card h-100">
              <div className="card-body p-4 home-card">
                <h2 className="home-card-title">
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
                      placeholder="Type your display name"
                      maxLength={50}
                      value={joinName}
                      onChange={e => setJoinName(e.target.value)}
                      disabled={isJoining}
                      style={{ transition: 'border-color 0.2s ease, box-shadow 0.2s ease' }}
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
                      placeholder="PASTE ROOM CODE"
                      maxLength={8}
                      value={joinCode}
                      onChange={e =>
                        setJoinCode(
                          e.target.value
                            .replace(/[^A-Za-z0-9]/g, '')
                            .toUpperCase()
                            .slice(0, 8),
                        )
                      }
                      disabled={isJoining}
                      style={{
                        letterSpacing: 3,
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        fontSize: 18,
                        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-success w-100"
                    disabled={isJoining}
                    style={{ transition: 'all 0.2s ease' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
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

        <div className="row mt-4 text-center">
          <div className="col-4">
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: 0.4 }}>P2P VIDEO</div>
          </div>
          <div className="col-4">
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: 0.4 }}>NO RECORDING</div>
          </div>
          <div className="col-4">
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: 0.4 }}>UP TO 8 USERS</div>
          </div>
        </div>

        {/* ── footer note ── */}
        <p className="text-center mt-5" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Sign language detection runs entirely in your browser — no data is sent to any server.
        </p>

      </div>
    </div>
  );
}

export default HomePage;
