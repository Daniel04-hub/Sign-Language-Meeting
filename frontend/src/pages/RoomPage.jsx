/**
 * pages/RoomPage.jsx
 *
 * Full video-call room — Batch 3.1 (MediaPipe / Sign Detection integrated).
 *
 * Responsibilities:
 *   1. Read roomCode from URL and userId/userName from sessionStorage.
 *   2. Initialise local camera + microphone via useWebRTC.
 *   3. Open a WebSocket connection via useWebSocket.
 *   4. Route every inbound WS message to WebRTC / UI / sign handlers.
 *   5. Drive sign-language detection via useSignDetection.
 *   6. Render the full room UI:
 *        • Top navbar  (logo + room-code pill + count + timer)
 *        • VideoGrid   (all participants)
 *        • SignDetectionOverlay (HUD — top right)
 *        • HandLandmarkCanvas  (dev debug — bottom left)
 *        • CaptionOverlay      (speech-to-text, above controls)
 *        • ControlsBar         (fixed bottom)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { useWebSocket } from '../hooks/useWebSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSignDetection } from '../hooks/useSignDetection';
import { useSpeechCaption } from '../hooks/useSpeechCaption';

import VideoGrid from '../components/VideoGrid';
import ControlsBar from '../components/ControlsBar';
import CaptionOverlay from '../components/CaptionOverlay';
import SignDetectionOverlay from '../components/SignDetectionOverlay';
import HandLandmarkCanvas from '../components/HandLandmarkCanvas';
import SpeechModeIndicator from '../components/SpeechModeIndicator';
import PermissionErrorModal from '../components/PermissionErrorModal';
import Toast from '../components/Toast';

// ─── elapsed-time hook ────────────────────────────────────────────────────────

/** Returns a string "MM:SS" counting up from the moment the hook first runs. */
function useElapsedTime() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// ─── RoomPage ─────────────────────────────────────────────────────────────────

function RoomPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const timer = useElapsedTime();

  // ── session identity (set by HomePage before navigating here) ───────
  const userId = sessionStorage.getItem('userId') ?? '';
  const userName = sessionStorage.getItem('userName') ?? 'Anonymous';

  // Redirect to home if session data is missing (e.g. direct URL visit).
  useEffect(() => {
    if (!userId || !roomCode) {
      navigate('/', { replace: true });
    }
  }, [userId, roomCode, navigate]);

  // ── local UI state ────────────────────────────────────────────────────
  const [caption, setCaption] = useState(null);   // {text, fromName, isFinal}
  const [signDetections, setSignDetections] = useState({});     // {userId: signText}
  const [mediaError, setMediaError] = useState('');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionType, setPermissionType] = useState('microphone');
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  const showToast = useCallback((message, type = 'info') => {
    setToast({ show: true, message, type });
  }, []);

  // ── WebRTC hook ─────────────────────────────────────────────────────
  // sendMessage is provided later (by useWebSocket). We forward a stable
  // ref so useWebRTC / useSignDetection callbacks always use the live sender.
  const sendMessageRef = useRef(() => {});

  const {
    participants,
    isMicOn,
    isCameraOn,
    localVideoRef,
    initializeMedia,
    toggleMic,
    toggleCamera,
    leaveRoom,
    handleWebSocketMessage: routeWebRTCMessage,
  } = useWebRTC(roomCode, userId, userName, (type, data) => {
    sendMessageRef.current(type, data);
  });

  // ── inbound WS message handler ────────────────────────────────────────
  const handleMessage = useCallback((message) => {
    switch (message.type) {
      // WebRTC signalling — delegate to the WebRTC hook.
      case 'connected':
      case 'user-joined':
      case 'new-user':
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'ice-candidate':
      case 'user-left':
        routeWebRTCMessage(message);
        break;

      // Sign language detection result (broadcast by server to ALL users).
      case 'sign-detected': {
        const fromId   = message.from_id ?? message.user_id;
        const signText = message.sign;

        setSignDetections(prev => ({ ...prev, [fromId]: signText }));

        // Optionally speak the sign for participants who aren't the sender.
        if (fromId !== userId && 'speechSynthesis' in window) {
          const utter = new SpeechSynthesisUtterance(signText);
          utter.rate   = 1.1;
          utter.volume = 0.8;
          window.speechSynthesis.speak(utter);
        }

        // Auto-clear the badge after 2.5 s.
        setTimeout(() => {
          setSignDetections(prev => {
            const next = { ...prev };
            delete next[fromId];
            return next;
          });
        }, 2500);
        break;
      }

      // Speech-to-text caption (server echoes from sender).
      case 'speech-text': {
        const senderId = message.user_id ?? message.from_id;
        if (senderId !== userId) {
          setCaption({
            text: message.text,
            fromName: message.from_name ?? 'Unknown',
            isFinal: message.is_final ?? true,
          });
        }
        break;
      }

      default:
        break;
    }
  }, [routeWebRTCMessage, userId]);

  // ── WebSocket hook ────────────────────────────────────────────────────
  const { isConnected, sendMessage, reconnect } = useWebSocket(
    roomCode,
    userId,
    userName,
    handleMessage,
  );

  // Keep the ref up-to-date so all callbacks always use the live sender.
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ── sign detection hook ───────────────────────────────────────────────
  const {
    isSignModeOn,
    currentSign,
    isModelLoaded,
    isHandDetected,
    startSignDetection,
    stopSignDetection,
    canvasRef: signCanvasRef,
    landmarks,
  } = useSignDetection(
    localVideoRef,
    sendMessage,
    userId,
    userName,
  );

  const {
    isListening,
    isSupported: isSpeechSupported,
    permissionDenied,
    interimText,
    startListening,
    stopListening,
  } = useSpeechCaption(
    sendMessage,
    userId,
    userName,
    isSignModeOn,
  );

  useEffect(() => {
    if (permissionDenied) {
      setPermissionType('microphone');
      setShowPermissionModal(true);
    }
  }, [permissionDenied]);

  // ── media initialisation ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    initializeMedia().catch(err => {
      if (!cancelled) setMediaError(err.message ?? 'Camera / microphone access denied.');
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── leave ─────────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    if (isSignModeOn) stopSignDetection();
    stopListening();
    leaveRoom();
    navigate('/');
  }, [isSignModeOn, stopSignDetection, stopListening, leaveRoom, navigate]);

  // ── sign mode toggle ───────────────────────────────────────────────────
  const handleToggleSign = useCallback(() => {
    if (isSignModeOn) {
      stopSignDetection();
      return;
    }

    stopListening();
    startSignDetection();
  }, [isSignModeOn, startSignDetection, stopSignDetection, stopListening]);

  const handleToggleSpeech = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }

    if (isSignModeOn) {
      showToast('Turn off Sign Mode first', 'warning');
      return;
    }

    startListening();
  }, [isListening, isSignModeOn, startListening, stopListening, showToast]);

  // ─────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        height:        '100dvh',   // dynamic viewport height (accounts for mobile bars)
        background:    'var(--bg-primary)',
        color:         'var(--text-primary)',
        overflow:      'hidden',
      }}
    >
      {/* ── top navbar ────────────────────────────────────────────── */}
      <nav
        className="navbar navbar-dark"
        style={{
          background:    'var(--bg-secondary)',
          padding:       '0 16px',
          height:        56,
          flexShrink:    0,
          borderBottom:  '1px solid var(--border-color)',
        }}
      >
        {/* Logo */}
        <span className="navbar-brand mb-0 fw-bold" style={{ fontSize: 20 }}>
          🤟 SignMeet
        </span>

        {/* Room code pill */}
        <div className="d-flex align-items-center gap-3">
          <span
            className="badge"
            style={{
              background:   'var(--bg-tertiary)',
              color:        'var(--text-primary)',
              fontFamily:   'monospace',
              fontSize:     14,
              letterSpacing: 2,
              padding:      '6px 12px',
              borderRadius: 20,
            }}
            title="Share this code with others"
          >
            {roomCode}
          </span>

          {/* Connection status dot */}
          <span
            title={isConnected ? 'Connected' : 'Disconnected'}
            style={{
              width:        10,
              height:       10,
              borderRadius: '50%',
              background:   isConnected ? '#22C55E' : '#EF4444',
              display:      'inline-block',
              flexShrink:   0,
            }}
          />
        </div>

        {/* Right: participant count + timer */}
        <div
          style={{
            color:    'var(--text-secondary)',
            fontSize: 13,
            display:  'flex',
            gap:      16,
            alignItems: 'center',
          }}
        >
          <span>👥 {participants.length}</span>
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'monospace',
              fontSize:   14,
            }}
          >
            ⏱ {timer}
          </span>

          {/* Reconnect button (only when disconnected) */}
          {!isConnected && (
            <button
              className="btn btn-sm btn-outline-warning py-0"
              onClick={reconnect}
              style={{ fontSize: 12 }}
            >
              Reconnect
            </button>
          )}
        </div>
      </nav>

      {/* ── media error banner ────────────────────────────────────── */}
      {mediaError && (
        <div className="alert alert-warning mb-0 py-2 text-center" style={{ borderRadius: 0, flexShrink: 0 }}>
          ⚠️ {mediaError} — others won't see or hear you.
        </div>
      )}

      {/* ── video grid (fills remaining space) ───────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '12px 12px 0' }}>
        <VideoGrid
          participants={participants}
          signDetections={signDetections}
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
        />
      </div>

      {/* ── sign detection overlay (fixed top-right HUD) ───────── */}
      <SignDetectionOverlay
        isSignModeOn={isSignModeOn}
        isHandDetected={isHandDetected}
        currentSign={currentSign}
        isModelLoaded={isModelLoaded}
      />

      {/* ── dev-only hand landmark debug canvas (bottom-left) ─────── */}
      <HandLandmarkCanvas
        isSignModeOn={isSignModeOn}
        landmarks={landmarks}
      />

      {/* ── hidden canvas for MediaPipe frame capture ─────────────── */}
      <canvas ref={signCanvasRef} style={{ display: 'none' }} aria-hidden="true" />

      <CaptionOverlay
        caption={caption}
        onClear={() => setCaption(null)}
      />

      <SpeechModeIndicator
        isListening={isListening}
        isSupported={isSpeechSupported}
        permissionDenied={permissionDenied}
        interimText={interimText}
      />

      <PermissionErrorModal
        show={showPermissionModal}
        type={permissionType}
        onClose={() => setShowPermissionModal(false)}
      />

      <Toast
        message={toast.message}
        show={toast.show}
        type={toast.type}
        onHide={() => setToast({ show: false, message: '', type: 'info' })}
      />

      {/* ── controls bar (fixed bottom) ───────────────────────────── */}
      <ControlsBar
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        isListening={isListening}
        isSpeechSupported={isSpeechSupported}
        isSignMode={isSignModeOn}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleSpeech={handleToggleSpeech}
        onToggleSign={handleToggleSign}
        onLeave={handleLeave}
        participantCount={participants.length}
      />

    </div>
  );
}

export default RoomPage;
