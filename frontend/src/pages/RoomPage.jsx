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
import ParticipantSidebar from '../components/ParticipantSidebar';
import MediaErrorScreen from '../components/MediaErrorScreen';
import ConnectionStatusBar from '../components/ConnectionStatusBar';
import DebugPanel from '../components/DebugPanel';
import {
  setTTSVolume,
  setTTSEnabled,
  speakSign,
} from '../utils/tts';

// ─── RoomPage ─────────────────────────────────────────────────────────────────

function RoomPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  // ── session identity (tab-scoped for reliable multi-tab joins) ───────
  const [userId] = useState(() => {
    const generatedId =
      globalThis.crypto?.randomUUID?.()
      ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('userId', generatedId);
    return generatedId;
  });
  const [userName] = useState(() => {
    const storedName = sessionStorage.getItem('userName')?.trim();
    return storedName || 'Anonymous';
  });

  // Redirect to home if session data is missing (e.g. direct URL visit).
  useEffect(() => {
    if (!userId || !roomCode) {
      navigate('/', { replace: true });
    }
  }, [userId, roomCode, navigate]);

  // ── local UI state ────────────────────────────────────────────────────
  const [caption, setCaption] = useState(null);   // {text, fromName, isFinal}
  const [signDetections, setSignDetections] = useState({});     // {userId: signText}
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionType, setPermissionType] = useState('microphone');
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [ttsEnabled, setTTSEnabledState] = useState(true);
  const [ttsVolume, setTTSVolumeState] = useState(1.0);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState('00:00:00');
  const [currentSign, setCurrentSign] = useState(null);
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const showDebug = new URLSearchParams(window.location.search).get('debug') === 'true';

  const showToast = useCallback((message, type = 'info') => {
    setToast({ show: true, message, type });
  }, []);

  // ── WebRTC hook ─────────────────────────────────────────────────────
  // sendMessage is provided later (by useWebSocket). We forward a stable
  // ref so useWebRTC / useSignDetection callbacks always use the live sender.
  const sendMessageRef = useRef(() => {});

  const lastSignRef = useRef({});
  const lastSignTimeRef = useRef({});

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
    mediaError,
    setMediaError,
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

      case 'room-full': {
        navigate('/', {
          state: { error: 'Room is full. Maximum 8 participants.' },
        });
        break;
      }

      case 'error': {
        showToast(message.message || 'Server error occurred', 'error');
        break;
      }

      // Sign language detection result (broadcast by server to ALL users).
      case 'sign-detected': {
        const data = {
          ...message,
          from_id: message.from_id ?? message.user_id,
        };

        const receivedSign = data.sign;

        if (
          !receivedSign ||
          receivedSign === 'NOTHING' ||
          receivedSign === 'del' ||
          receivedSign === 'space'
        ) {
          break;
        }

        setSignDetections((prev) => ({
          ...prev,
          [data.from_id]: receivedSign,
        }));

        if (data.from_id !== userId) {
          const now = Date.now();
          const lastTime = lastSignTimeRef.current[data.from_id] || 0;

          if (
            receivedSign !== lastSignRef.current[data.from_id] ||
            now - lastTime > 3000
          ) {
            speakSign(receivedSign);
            lastSignRef.current[data.from_id] = receivedSign;
            lastSignTimeRef.current[data.from_id] = now;
          }
        }

        setTimeout(() => {
          setSignDetections((prev) => {
            const updated = { ...prev };
            delete updated[data.from_id];
            return updated;
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
  }, [routeWebRTCMessage, userId, navigate, showToast]);

  // ── WebSocket hook ────────────────────────────────────────────────────
  const {
    isConnected,
    sendMessage,
    reconnect,
    disconnect,
    connectionStatus,
    reconnectAttempts,
  } = useWebSocket(
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
    currentSign: detectedSign,
    currentConfidence: detectedConfidence,
    isModelLoaded,
    isHandDetected,
    isHandStable,
    mockMode,
    predictionHistory,
    totalPredictions,
    fps,
    startSignDetection,
    stopSignDetection,
    canvasRef: signCanvasRef,
    landmarks,
  } = useSignDetection(
    localVideoRef,
    sendMessage,
    userId,
    userName,
    (sign, confidence) => {
      setCurrentSign(sign);
      setCurrentConfidence(confidence);
    },
  );

  useEffect(() => {
    if (!detectedSign) {
      return;
    }
    setCurrentSign(detectedSign);
    setCurrentConfidence(detectedConfidence || 0);
  }, [detectedSign, detectedConfidence]);

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

  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;
      setTimerDisplay(
        [hours, minutes, seconds]
          .map(n => String(n).padStart(2, '0'))
          .join(':'),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── media initialisation ──────────────────────────────────────────────
  useEffect(() => {
    initializeMedia().catch(() => {
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleBeforeUnload = () => {
      leaveRoom();
      disconnect();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [leaveRoom, disconnect]);

  // ── leave ─────────────────────────────────────────────────────────────
  const cancelSpeech = useCallback(() => {
    stopListening();
  }, [stopListening]);

  const handleLeave = useCallback(() => {
    cancelSpeech();
    stopSignDetection();
    stopListening();
    leaveRoom();
    disconnect();
    navigate('/');
  }, [cancelSpeech, stopSignDetection, stopListening, leaveRoom, disconnect, navigate]);

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
   * Copies room code to clipboard and shows feedback.
   * @returns {Promise<void>}
   */
  const handleCopyRoomCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
      showToast('Room code copied to clipboard');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }, [roomCode, showToast]);

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

  const sidebarParticipants = participants.map((participant) => ({
    userId: participant.userId,
    userName: participant.userName,
    isMuted: participant.isLocal ? !isMicOn : Boolean(participant.isMuted),
    isCameraOff: participant.isLocal ? !isCameraOn : Boolean(participant.isCameraOff),
    isSigning: Boolean(signDetections[participant.userId]) || Boolean(participant.isSigning),
    isSpeaking: caption?.fromName === participant.userName && caption?.isFinal === false,
    quality: participant.quality ?? 'unknown',
  }));

  const participantCountText = participants.length === 1
    ? '1 person'
    : `${participants.length} people`;

  if (mediaError) {
    return (
      <MediaErrorScreen
        error={mediaError}
        onRetry={() => {
          setMediaError(null);
          initializeMedia().catch(() => {
          });
        }}
      />
    );
  }

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
      <nav className="room-navbar" role="navigation" aria-label="Room navigation">
        <div className="app-logo">Sign Language Meeting</div>

        <div className="room-info">
          <button
            type="button"
            className={`room-code-pill ${codeCopied ? 'copied' : ''}`}
            onClick={handleCopyRoomCode}
            title="Click to copy room code"
          >
            {codeCopied ? 'Copied!' : roomCode}
          </button>
          <span className="meeting-timer">{timerDisplay}</span>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-light"
            onClick={() => setIsSidebarOpen(prev => !prev)}
          >
            {participantCountText}
          </button>

          {isSignModeOn && (
            <span
              className="badge"
              style={{ background: isModelLoaded ? 'var(--accent-green)' : 'var(--accent-yellow)', color: isModelLoaded ? 'white' : 'black' }}
            >
              {isModelLoaded ? 'AI Ready' : 'Mock Mode'}
            </span>
          )}

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
      <ConnectionStatusBar status={connectionStatus} attemptNumber={reconnectAttempts} />

      {/* ── video grid / waiting state ───────────────────────────── */}
      <div id="video-grid" style={{ flex: 1, overflow: 'hidden', padding: '12px 12px 0' }}>
        <VideoGrid
          participants={participants}
          signDetections={signDetections}
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
        />
      </div>

      <ParticipantSidebar
        participants={sidebarParticipants}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        localUserId={userId}
      />

      {/* ── sign detection overlay (fixed top-right HUD) ───────── */}
      <SignDetectionOverlay
        isSignModeOn={isSignModeOn}
        isHandDetected={isHandDetected}
        isHandStable={isHandStable}
        currentSign={currentSign}
        confidence={currentConfidence}
        isModelLoaded={isModelLoaded}
      />

      {showDebug && (
        <DebugPanel
          predictions={predictionHistory}
          isHandDetected={isHandDetected}
          isModelLoaded={isModelLoaded}
          isMockMode={mockMode}
          fps={fps}
          totalPredictions={totalPredictions}
        />
      )}

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
        onToggleParticipants={() => setIsSidebarOpen(prev => !prev)}
        onLeave={handleLeave}
        participantCount={participants.length}
      />

    </div>
  );
}

export default RoomPage;
