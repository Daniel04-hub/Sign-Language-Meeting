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
import TTSControls from '../components/TTSControls';
import {
  setTTSVolume,
  setTTSEnabled,
  speakWithPriority,
} from '../utils/tts';

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
  const [ttsEnabled, setTTSEnabledState] = useState(true);
  const [ttsVolume, setTTSVolumeState] = useState(1.0);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ show: true, message, type });
  }, []);

  const signSpeechMap = {
    HELLO: 'Hello there',
    THANKS: 'Thank you',
    BYE: 'Goodbye',
    YES: 'Yes',
    NO: 'No',
  };

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
        const confidence = Number(message.confidence ?? 0);

        setSignDetections(prev => ({ ...prev, [fromId]: signText }));

        console.log(
          `SignMeet: Sign detected: ${signText} confidence: ${(confidence * 100).toFixed(1)}%`,
        );

        if (fromId !== userId) {
          const phrase = signSpeechMap[signText] ?? signText;
          speakWithPriority(phrase, 'normal');
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

  useEffect(() => {
    setTTSEnabled(ttsEnabled);
  }, [ttsEnabled]);

  useEffect(() => {
    setTTSVolume(ttsVolume);
  }, [ttsVolume]);

  useEffect(() => {
    try {
      const mediaQuery = window.matchMedia('(prefers-contrast: high)');

      const updateContrastClass = () => {
        if (mediaQuery.matches) {
          document.body.classList.add('high-contrast-captions');
        } else {
          document.body.classList.remove('high-contrast-captions');
        }
      };

      updateContrastClass();
      mediaQuery.addEventListener('change', updateContrastClass);

      return () => {
        mediaQuery.removeEventListener('change', updateContrastClass);
        document.body.classList.remove('high-contrast-captions');
      };
    } catch (error) {
      console.warn('RoomPage: high contrast detection failed:', error);
      return () => {};
    }
  }, []);

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

  /**
   * Toggles global TTS enable/disable state.
   * @returns {void}
   */
  const handleToggleTTS = useCallback(() => {
    const newValue = !ttsEnabled;
    setTTSEnabledState(newValue);
    setTTSEnabled(newValue);
  }, [ttsEnabled]);

  /**
   * Applies the selected TTS volume.
   * @param {number} newVolume
   * @returns {void}
   */
  const handleVolumeChange = useCallback((newVolume) => {
    setTTSVolumeState(newVolume);
    setTTSVolume(newVolume);
  }, []);

  useEffect(() => {
    /**
     * Handles global keyboard shortcuts.
     * @param {KeyboardEvent} event
     * @returns {void}
     */
    const handleKeyDown = (event) => {
      try {
        if (!event.altKey) return;

        const key = event.key.toLowerCase();
        if (key === 'm') {
          event.preventDefault();
          toggleMic();
          showToast('Shortcut: Toggled mic');
        } else if (key === 'c') {
          event.preventDefault();
          toggleCamera();
          showToast('Shortcut: Toggled camera');
        } else if (key === 's') {
          event.preventDefault();
          handleToggleSign();
          showToast('Shortcut: Toggled sign mode');
        } else if (key === 't') {
          event.preventDefault();
          handleToggleSpeech();
          showToast('Shortcut: Toggled captions');
        } else if (key === 'l') {
          event.preventDefault();
          showToast('Shortcut: Leaving room', 'warning');
          setTimeout(() => handleLeave(), 200);
        }
      } catch (error) {
        console.warn('RoomPage: keyboard shortcut failed:', error);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleMic, toggleCamera, handleToggleSign, handleToggleSpeech, handleLeave, showToast]);

  const showTTSControls = isSignModeOn || Object.keys(signDetections).length > 0;

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
      <a
        href="#video-grid"
        className="visually-hidden-focusable"
        style={{ position: 'absolute', top: 8, left: 8, zIndex: 1500 }}
      >
        Skip to video grid
      </a>

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

          <button
            type="button"
            className="btn btn-sm btn-outline-light py-0"
            style={{ width: 24, height: 24, lineHeight: '18px', padding: 0 }}
            onClick={() => setShowShortcutsModal(true)}
            aria-label="Show keyboard shortcuts"
            title="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </nav>

      {/* ── media error banner ────────────────────────────────────── */}
      {mediaError && (
        <div className="alert alert-warning mb-0 py-2 text-center" style={{ borderRadius: 0, flexShrink: 0 }}>
          ⚠️ {mediaError} — others won't see or hear you.
        </div>
      )}

      {/* ── video grid (fills remaining space) ───────────────────── */}
      <div id="video-grid" style={{ flex: 1, overflow: 'hidden', padding: '12px 12px 0' }}>
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

      {showTTSControls && (
        <TTSControls
          ttsEnabled={ttsEnabled}
          ttsVolume={ttsVolume}
          onToggleTTS={handleToggleTTS}
          onVolumeChange={handleVolumeChange}
        />
      )}

      {showShortcutsModal && (
        <div
          className="modal fade show"
          tabIndex="-1"
          role="dialog"
          style={{ display: 'block', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h5 className="modal-title">Keyboard Shortcuts</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close"
                  onClick={() => setShowShortcutsModal(false)}
                />
              </div>
              <div className="modal-body">
                <table className="table table-dark table-striped table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Shortcut</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Alt + M</td><td>Toggle mic</td></tr>
                    <tr><td>Alt + C</td><td>Toggle camera</td></tr>
                    <tr><td>Alt + S</td><td>Toggle signing</td></tr>
                    <tr><td>Alt + T</td><td>Toggle captions</td></tr>
                    <tr><td>Alt + L</td><td>Leave room</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

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
