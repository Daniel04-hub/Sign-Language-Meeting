/**
 * components/LoadingSpinner.jsx
 *
 * Reusable Bootstrap spinner with an optional message.
 *
 * Props:
 *   size    {string}  "sm" | "md" | "lg"  — controls spinner dimensions
 *   color   {string}  Bootstrap text-color class, e.g. "text-primary"
 *   message {string}  Optional label rendered below the spinner
 */

function LoadingSpinner({ size = 'md', color = 'text-light', message = '' }) {
  const sizeMap = {
    sm: { width: '1rem',  height: '1rem',  borderWidth: '0.15em' },
    md: { width: '2rem',  height: '2rem',  borderWidth: '0.2em'  },
    lg: { width: '3rem',  height: '3rem',  borderWidth: '0.25em' },
  };

  const dims = sizeMap[size] ?? sizeMap.md;

  return (
    <div className="d-flex flex-column align-items-center justify-content-center gap-2">
      <div
        className={`spinner-border ${color}`}
        role="status"
        style={{ width: dims.width, height: dims.height, borderWidth: dims.borderWidth }}
      >
        <span className="visually-hidden">Loading…</span>
      </div>
      {message && (
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {message}
        </span>
      )}
    </div>
  );
}

export default LoadingSpinner;
