/**
 * components/ConnectionQuality.jsx
 *
 * Small dot indicator for participant connection quality.
 */

/**
 * ConnectionQuality indicator component.
 * @param {Object} props
 * @param {'good'|'medium'|'poor'|'unknown'} props.quality
 * @param {boolean} props.showLabel
 * @returns {JSX.Element}
 */
function ConnectionQuality({ quality = 'unknown', showLabel = false }) {
  const normalized = ['good', 'medium', 'poor', 'unknown'].includes(quality)
    ? quality
    : 'unknown';

  const labels = {
    good: 'Good',
    medium: 'Fair',
    poor: 'Poor',
    unknown: '',
  };

  if (!showLabel) {
    return <span className={`quality-indicator quality-${normalized}`} aria-label={`Connection quality ${labels[normalized] || 'unknown'}`} />;
  }

  return (
    <div className="d-flex align-items-center gap-1" aria-label={`Connection quality ${labels[normalized] || 'unknown'}`}>
      <span className={`quality-indicator quality-${normalized}`} style={{ position: 'static' }} />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {labels[normalized]}
      </span>
    </div>
  );
}

export default ConnectionQuality;
