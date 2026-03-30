function DebugPanel({
  predictions = [],
  isHandDetected,
  isModelLoaded,
  isMockMode,
  fps,
  totalPredictions,
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        color: '#d1d5db',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        padding: '10px 12px',
        minWidth: 260,
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.45,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <div style={{ color: '#f9fafb', marginBottom: 6 }}>DEBUG</div>
      <div>FPS: {Number.isFinite(fps) ? fps : 0}</div>
      <div>Hand detected: {isHandDetected ? 'yes' : 'no'}</div>
      <div>Model loaded: {isModelLoaded ? 'yes' : 'no'}</div>
      <div>Mock mode: {isMockMode ? 'yes' : 'no'}</div>
      <div>Total predictions: {totalPredictions}</div>

      <div style={{ marginTop: 8, color: '#f9fafb' }}>Last 5 predictions:</div>
      {predictions.length === 0 ? (
        <div>-</div>
      ) : (
        predictions
          .slice()
          .reverse()
          .map((item, index) => (
            <div key={`${item.sign}-${index}`}>
              {item.sign} ({Math.round((item.confidence || 0) * 100)}%)
            </div>
          ))
      )}
    </div>
  );
}

export default DebugPanel;
