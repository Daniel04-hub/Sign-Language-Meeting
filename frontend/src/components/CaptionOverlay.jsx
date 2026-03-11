/**
 * components/CaptionOverlay.jsx
 *
 * Fixed overlay that displays the most recent speech-to-text caption
 * above the controls bar.  Auto-hides after 6 seconds of inactivity.
 *
 * Props:
 *   caption {object|null}
 *     caption.text     {string}   — transcript text
 *     caption.fromName {string}   — speaker's display name
 *     caption.isFinal  {boolean}  — false while still transcribing (interim)
 */

import { useState, useEffect, useRef } from 'react';

function CaptionOverlay({ caption }) {
  const [visible, setVisible]         = useState(false);
  const [displayed, setDisplayed]     = useState(null);  // last caption we rendered
  const hideTimerRef                  = useRef(null);

  useEffect(() => {
    if (!caption?.text) return;

    // Update content and (re)start the hide timer.
    setDisplayed(caption);
    setVisible(true);

    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), 6000);

    return () => clearTimeout(hideTimerRef.current);
  }, [caption]);

  if (!visible || !displayed) return null;

  const { text, fromName, isFinal } = displayed;

  const textStyle = {
    fontStyle:  isFinal ? 'normal' : 'italic',
    opacity:    isFinal ? 1        : 0.7,
    fontWeight: isFinal ? 500      : 400,
  };

  return (
    <div className="caption-overlay">
      <span style={{ color: 'var(--accent-blue)', fontWeight: 600, marginRight: 6 }}>
        {fromName}:
      </span>
      <span style={textStyle}>{text}</span>
      {!isFinal && (
        <span style={{ opacity: 0.5, marginLeft: 4, fontSize: '0.85em' }}>…</span>
      )}
    </div>
  );
}

export default CaptionOverlay;
