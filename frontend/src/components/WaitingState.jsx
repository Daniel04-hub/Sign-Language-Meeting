/**
 * components/WaitingState.jsx
 *
 * Friendly waiting UI shown when user is alone in the room.
 */

/**
 * WaitingState component.
 * @param {Object} props
 * @param {string} props.roomCode
 * @param {string} props.userName
 * @param {() => void} props.onCopyCode
 * @returns {JSX.Element}
 */
function WaitingState({ roomCode, userName, onCopyCode }) {
  return (
    <div className="waiting-container">
      <h3>Waiting for others to join</h3>
      <p>
        Share this code with people you want to meet:
      </p>

      <div className="d-flex align-items-center gap-2">
        <span
          style={{
            fontFamily: "'Courier New', monospace",
            letterSpacing: 4,
            fontSize: 22,
            color: 'var(--accent-blue)',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            padding: '8px 14px',
            borderRadius: 10,
          }}
        >
          {roomCode}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          onClick={onCopyCode}
        >
          Copy
        </button>
      </div>

      <div className="row w-100" style={{ maxWidth: 720 }}>
        <div className="col-4 text-center">
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Sign Language AI</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Real-time sign understanding in your browser</div>
        </div>
        <div className="col-4 text-center">
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Live Captions</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Speech appears instantly for clear communication</div>
        </div>
        <div className="col-4 text-center">
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>P2P Video</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Private direct browser-to-browser connection</div>
        </div>
      </div>

      <div className="waiting-dots" aria-label="Waiting animation">
        <span />
        <span />
        <span />
      </div>

      <p style={{ marginTop: 4, fontSize: 12 }}>
        {userName}, your meeting is ready.
      </p>
    </div>
  );
}

export default WaitingState;
