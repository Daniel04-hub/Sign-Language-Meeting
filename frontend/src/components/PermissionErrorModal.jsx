function PermissionErrorModal({ show, type, onClose }) {
  if (!show) return null;

  const isMic = type === 'microphone';

  const title = isMic ? 'Microphone Access Required' : 'Camera Access Required';
  const intro = isMic
    ? 'Speech captions require microphone access.'
    : 'Video calls require camera access.';
  const deviceLabel = isMic ? 'Microphone' : 'Camera';

  return (
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
            <h5 className="modal-title">{title}</h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              aria-label="Close"
              onClick={onClose}
            />
          </div>
          <div className="modal-body">
            <p className="mb-2">{intro}</p>
            <p className="mb-2">To enable:</p>
            <ol className="mb-0 ps-3">
              <li>Click the lock icon in your browser address bar</li>
              <li>Find {deviceLabel} in the permissions list</li>
              <li>Change to Allow</li>
              <li>Refresh this page</li>
            </ol>
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)' }}>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PermissionErrorModal;
