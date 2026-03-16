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

function CaptionOverlay({ caption, onClear }) {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!caption) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);

    if (caption.isFinal) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onClear?.();
      }, 6000);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [caption, onClear]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  if (!isVisible || !caption) return null;

  return (
    <div
      className={`caption-overlay${caption.isFinal ? '' : ' interim'}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="caption-from">
        {caption.fromName}:
      </span>
      {' '}
      <span className="caption-text">
        {caption.text}
      </span>
    </div>
  );
}

export default CaptionOverlay;
