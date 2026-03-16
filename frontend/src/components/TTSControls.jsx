import { useMemo } from 'react';

/**
 * TTSControls
 *
 * Compact TTS controls panel displayed near the controls bar.
 * Visible only when sign mode activity is present in the room.
 *
 * @param {Object} props
 * @param {boolean} props.ttsEnabled
 * @param {number} props.ttsVolume
 * @param {() => void} props.onToggleTTS
 * @param {(newVolume: number) => void} props.onVolumeChange
 * @returns {JSX.Element}
 */
function TTSControls({
  ttsEnabled,
  ttsVolume,
  onToggleTTS,
  onVolumeChange,
}) {
  /**
   * Converts normalized volume to rounded percentage.
   * @type {number}
   */
  const volumePercent = useMemo(
    () => Math.round((Number(ttsVolume) || 0) * 100),
    [ttsVolume],
  );

  /**
   * Handles slider value changes.
   * @param {React.ChangeEvent<HTMLInputElement>} event
   * @returns {void}
   */
  const handleSliderChange = (event) => {
    try {
      const value = Number(event.target.value);
      onVolumeChange(value);
    } catch (error) {
      console.warn('TTSControls: volume change failed:', error);
    }
  };

  return (
    <div
      className="d-flex align-items-center gap-2"
      style={{
        position: 'fixed',
        bottom: 90,
        left: 16,
        zIndex: 510,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 18,
        padding: '6px 10px',
      }}
      role="group"
      aria-label="Text to speech controls"
    >
      <button
        type="button"
        className="btn btn-sm"
        onClick={onToggleTTS}
        title={ttsEnabled ? 'Disable TTS' : 'Enable TTS'}
        aria-pressed={ttsEnabled}
        style={{
          background: ttsEnabled ? 'var(--accent-blue)' : '#48484A',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: 28,
          height: 28,
          padding: 0,
          fontSize: 12,
          lineHeight: '28px',
          textAlign: 'center',
        }}
      >
        SPK
      </button>

      {ttsEnabled && (
        <input
          type="range"
          className="tts-volume"
          min="0"
          max="1"
          step="0.1"
          value={ttsVolume}
          onChange={handleSliderChange}
          aria-label="TTS volume"
        />
      )}

      <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 32 }}>
        {volumePercent}%
      </span>
    </div>
  );
}

export default TTSControls;
