function SpeechModeIndicator({
  isListening,
  isSupported,
  permissionDenied,
  interimText,
}) {
  if (!isSupported) return null;

  if (permissionDenied) {
    const explainPermission = () => {
      window.alert(
        'Microphone access is blocked.\n\n' +
        'To allow it:\n' +
        '1. Click the lock icon in the address bar\n' +
        '2. Find Microphone permission\n' +
        '3. Change it to Allow\n' +
        '4. Refresh this page'
      );
    };

    return (
      <div
        className="speech-mode-indicator speech-mode-indicator-denied"
        role="status"
        aria-live="polite"
        onClick={explainPermission}
        style={{ cursor: 'pointer' }}
        title="Click for microphone permission help"
      >
        Mic permission denied
      </div>
    );
  }

  if (!isListening) return null;

  if (interimText?.trim()) {
    const trimmed = interimText.length > 40
      ? `${interimText.slice(0, 40).trim()}...`
      : interimText;

    return (
      <div className="speech-mode-indicator speech-mode-indicator-interim" role="status" aria-live="polite">
        <span className="typing-indicator" aria-hidden="true">...</span>
        {trimmed}
      </div>
    );
  }

  return (
    <div className="speech-mode-indicator speech-mode-indicator-listening" role="status" aria-live="polite">
      <span className="pulse-dot" aria-hidden="true" />
      Listening...
    </div>
  );
}

export default SpeechModeIndicator;
