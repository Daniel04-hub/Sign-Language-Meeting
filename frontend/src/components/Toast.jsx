import { useEffect } from 'react';

function Toast({
  message,
  show,
  onHide,
  type = 'info',
  duration = 3000,
}) {
  useEffect(() => {
    if (!show) return undefined;

    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [show, duration, onHide]);

  if (!show || !message) return null;

  const typeStyles = {
    info: {
      background: 'var(--accent-blue)',
      color: 'white',
    },
    warning: {
      background: 'var(--accent-yellow)',
      color: 'black',
    },
    error: {
      background: 'var(--accent-red)',
      color: 'white',
    },
  };

  const style = typeStyles[type] || typeStyles.info;

  return (
    <div
      className="toast show"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      style={{
        position: 'fixed',
        top: '72px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        minWidth: '280px',
        maxWidth: '90vw',
        border: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        ...style,
      }}
    >
      <div className="toast-body d-flex align-items-center justify-content-between">
        <span>{message}</span>
        <button
          type="button"
          className="btn-close ms-3"
          aria-label="Close"
          onClick={onHide}
          style={{ filter: style.color === 'white' ? 'invert(1)' : 'none' }}
        />
      </div>
    </div>
  );
}

export default Toast;
