function ConnectionStatusBar({ status, attemptNumber = 0 }) {
  if (!status || status === 'connected') {
    return null;
  }

  let bg = '#B7791F';
  let message = 'Connecting to room...';
  let actions = null;
  let showProgress = false;

  if (status === 'connecting') {
    bg = '#B7791F';
    message = 'Connecting to room...';
    showProgress = true;
  } else if (status === 'reconnecting') {
    bg = '#B7791F';
    message = `Connection lost. Reconnecting... (attempt ${attemptNumber}/5)`;
  } else if (status === 'disconnected') {
    bg = '#C05621';
    message = 'Disconnected from room.';
    actions = (
      <button
        type="button"
        className="btn btn-sm btn-outline-light"
        onClick={() => window.location.reload()}
      >
        Reload Page
      </button>
    );
  } else if (status === 'failed') {
    bg = '#C53030';
    message = 'Could not connect to room. Check your internet.';
    actions = (
      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-light"
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-light"
          onClick={() => { window.location.href = '/'; }}
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        left: 0,
        right: 0,
        zIndex: 300,
        background: bg,
        color: '#fff',
        animation: 'connection-bar-slide 240ms ease-out',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="d-flex align-items-center justify-content-between px-3 py-2" style={{ minHeight: 42 }}>
        <div className="d-flex align-items-center gap-2" style={{ fontSize: 13, fontWeight: 600 }}>
          {status === 'reconnecting' && <span className="spinner-border spinner-border-sm" aria-hidden="true" />}
          <span>{message}</span>
        </div>
        {actions}
      </div>

      {showProgress && (
        <div style={{ height: 2, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: '35%',
              background: '#fff',
              animation: 'connection-bar-progress 1.1s linear infinite',
            }}
          />
        </div>
      )}

      <style>
        {`\
        @keyframes connection-bar-slide {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes connection-bar-progress {
          from { transform: translateX(-130%); }
          to { transform: translateX(380%); }
        }
      `}
      </style>
    </div>
  );
}

export default ConnectionStatusBar;
