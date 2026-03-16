function MediaErrorScreen({ error, onRetry }) {
  const type = error?.type ?? 'unknown';
  const message = error?.message ?? 'Could not access media devices.';

  let icon = '📷';
  let title = 'Could Not Access Camera';
  let content = (
    <p style={{ color: 'var(--text-secondary)', marginBottom: 18 }}>
      {message}
    </p>
  );

  if (type === 'permission') {
    icon = '🚫📷';
    title = 'Camera or Microphone Blocked';
    content = (
      <ol style={{ color: 'var(--text-secondary)', textAlign: 'left', marginBottom: 18, paddingLeft: 18 }}>
        <li>Click the lock icon in your browser address bar</li>
        <li>Allow Camera and Microphone</li>
        <li>Click Retry below</li>
      </ol>
    );
  } else if (type === 'device') {
    icon = '📷';
    title = 'No Camera or Microphone Found';
    content = (
      <p style={{ color: 'var(--text-secondary)', marginBottom: 18 }}>
        Please connect a camera and microphone and try again.
      </p>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        padding: 16,
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 600 }}>
        <div className="card-body p-4 text-center">
          <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
          <h3 style={{ marginBottom: 10, fontWeight: 700 }}>{title}</h3>
          {content}
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

export default MediaErrorScreen;
