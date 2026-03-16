/**
 * components/ControlsBar.jsx
 *
 * Fixed bottom bar with all call-control buttons.
 * Buttons (left to right):
 *   🎤/🔇  Mic toggle      — red background when muted
 *   📹/📷  Camera toggle   — red background when off
 *   🤟    Sign Mode toggle — purple background when active
 *   🚪    Leave            — always red
 *
 * Centre displays the participant count.
 *
 * Props:
 *   isMicOn          {boolean}
 *   isCameraOn       {boolean}
 *   isSignMode       {boolean}
 *   onToggleMic      {() => void}
 *   onToggleCamera   {() => void}
 *   onToggleSign     {() => void}
 *   onLeave          {() => void}
 *   participantCount {number}
 */

function ControlsBar({
  isMicOn          = true,
  isCameraOn       = true,
  isListening      = false,
  isSpeechSupported = false,
  isSignMode       = false,
  onToggleMic,
  onToggleCamera,
  onToggleSpeech,
  onToggleSign,
  onToggleParticipants,
  onLeave,
  participantCount = 1,
}) {
  // ── shared button base style ─────────────────────────────────────────
  const base = {
    width:        48,
    height:       48,
    borderRadius: '50%',
    border:       'none',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    fontSize:     20,
    cursor:       'pointer',
    transition:   'transform 0.15s, opacity 0.15s',
    flexShrink:   0,
  };

  const btnStyle = (active, activeColor = '#EF4444', inactiveColor = 'var(--bg-tertiary)') => ({
    ...base,
    background: active ? inactiveColor : activeColor,
    color:      '#fff',
  });

  return (
    <div className="controls-bar">

      {/* ── left cluster ── */}
      <div className="d-flex align-items-center gap-3">

        {/* Mic toggle */}
        <button
          style={btnStyle(isMicOn)}
          title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          onClick={onToggleMic}
          aria-label={isMicOn ? 'Mute' : 'Unmute'}
        >
          {isMicOn ? '🎤' : '🔇'}
        </button>

        {/* Camera toggle */}
        <button
          style={btnStyle(isCameraOn)}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          onClick={onToggleCamera}
          aria-label={isCameraOn ? 'Camera off' : 'Camera on'}
        >
          {isCameraOn ? '📹' : '📷'}
        </button>

        <div className="d-flex flex-column align-items-center" style={{ minWidth: 58 }}>
          <button
            style={{
              ...base,
              width: 'auto',
              minWidth: 58,
              borderRadius: 24,
              padding: '0 14px',
              background: isListening ? 'var(--accent-green)' : '#48484A',
              color: '#fff',
              opacity: isSpeechSupported ? 1 : 0.4,
              cursor: isSpeechSupported ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 700,
            }}
            title={isListening ? 'Disable captions' : 'Enable captions'}
            onClick={onToggleSpeech}
            disabled={!isSpeechSupported}
            aria-label="Toggle captions"
          >
            CC
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1 }}>
            Captions
          </span>
        </div>

        {/* Sign Language mode toggle */}
        <button
          style={{
            ...base,
            background: isSignMode ? 'var(--accent-purple)' : 'var(--bg-tertiary)',
            color:       '#fff',
            width:       'auto',
            borderRadius: 24,
            padding:     '0 16px',
            gap:         6,
            fontSize:    14,
            display:     'flex',
          }}
          title={isSignMode ? 'Disable sign language detection' : 'Enable sign language detection'}
          onClick={onToggleSign}
          aria-pressed={isSignMode}
          aria-label="Toggle sign mode"
        >
          🤟
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Sign Mode {isSignMode ? 'ON' : 'OFF'}
          </span>
        </button>

      </div>

      {/* ── centre: participant count ── */}
      <div
        style={{
          position:  'absolute',
          left:      '50%',
          transform: 'translateX(-50%)',
          color:     'var(--text-secondary)',
          fontSize:  13,
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {participantCount} in call
      </div>

      {/* ── right: leave button ── */}
      <div className="d-flex align-items-center gap-2">
        <button
          style={{
            ...base,
            background: 'var(--bg-tertiary)',
            color: '#fff',
            width: 'auto',
            borderRadius: 24,
            padding: '0 14px',
            fontSize: 13,
            fontWeight: 600,
            position: 'relative',
          }}
          title="Show participants"
          onClick={onToggleParticipants}
          aria-label="Toggle participant sidebar"
        >
          People
          <span
            style={{
              marginLeft: 8,
              background: 'var(--accent-blue)',
              borderRadius: 10,
              padding: '1px 6px',
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            {participantCount}
          </span>
        </button>

        <button
          style={{ ...base, background: '#EF4444', color: '#fff', width: 'auto', borderRadius: 24, padding: '0 20px', fontSize: 14, fontWeight: 600 }}
          title="Leave meeting"
          onClick={onLeave}
          aria-label="Leave meeting"
        >
          🚪 Leave
        </button>
      </div>

    </div>
  );
}

export default ControlsBar;
