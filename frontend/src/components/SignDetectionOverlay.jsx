/**
 * components/SignDetectionOverlay.jsx
 *
 * Fixed HUD overlay (top-right) that shows the current state of the
 * sign-language detection pipeline.  Uses Bootstrap badge utilities
 * and CSS animations for the "sign detected" pulse.
 *
 * Props:
 *   isSignModeOn   {boolean}       — true if sign detection is active
 *   isHandDetected {boolean}       — true if MediaPipe sees a hand
 *   currentSign    {string|null}   — sign label currently displayed
 *   isModelLoaded  {boolean}       — true once the TF.js model is ready
 *                                    (or mock mode is confirmed)
 */

import { useState, useEffect } from 'react';

/* ── inline styles ─────────────────────────────────────────────────────── */

const container = {
  position:  'fixed',
  top:       80,
  right:     16,
  zIndex:    1000,
  display:   'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap:        8,
  pointerEvents: 'none',   // let clicks pass through
};

/** Base pill style shared by all states */
const pill = (extra = {}) => ({
  display:       'inline-flex',
  alignItems:    'center',
  gap:            6,
  padding:       '5px 13px',
  borderRadius:  999,
  fontSize:      13,
  fontWeight:    600,
  letterSpacing: 0.3,
  userSelect:    'none',
  transition:    'all 0.25s ease',
  ...extra,
});

/* ── keyframe injection (once) ─────────────────────────────────────────── */

const STYLE_ID = 'sign-detection-overlay-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    @keyframes sdo-pulse {
      0%, 100% { opacity: 1; transform: scale(1);    }
      50%       { opacity: 0.7; transform: scale(0.97); }
    }
    @keyframes sdo-pop {
      0%   { transform: scale(0.7); opacity: 0; }
      60%  { transform: scale(1.12); }
      100% { transform: scale(1);   opacity: 1; }
    }
    .sdo-pulse { animation: sdo-pulse 1.6s ease-in-out infinite; }
    .sdo-pop   { animation: sdo-pop   0.3s cubic-bezier(.34,1.56,.64,1) both; }
  `;
  document.head.appendChild(el);
}

/* ── component ─────────────────────────────────────────────────────────── */

function SignDetectionOverlay({
  isSignModeOn   = false,
  isHandDetected = false,
  isHandStable = false,
  currentSign    = null,
  confidence     = 0,
  isModelLoaded  = false,
}) {
  // Track sign display separately so we can hold it for 2 s after it clears.
  const [displaySign, setDisplaySign]   = useState(null);
  const [displayConfidence, setDisplayConfidence] = useState(0);
  const [signVisible,  setSignVisible]  = useState(false);
  const [signKey,      setSignKey]      = useState(0);     // force re-mount for animation

  // Inject keyframes on first render.
  useEffect(() => { injectStyles(); }, []);

  // Show sign for 2 s whenever currentSign changes.
  useEffect(() => {
    if (!currentSign) return;
    if (Number(confidence) < 0.92) return;
    setDisplaySign(currentSign);
    setDisplayConfidence(confidence);
    setSignVisible(true);
    setSignKey(k => k + 1);

    const t = setTimeout(() => setSignVisible(false), 2000);
    return () => clearTimeout(t);
  }, [currentSign, confidence]);

  if (!isSignModeOn) return null;

  return (
    <div style={container} aria-live="polite">

      {/* ── loading state ── */}
      {!isModelLoaded && (
        <span style={pill({ background: 'rgba(234,179,8,0.85)', color: '#fff' })}>
          ⏳ Loading AI Model…
        </span>
      )}

      {/* ── runtime status (model ready) ── */}
      {isModelLoaded && !signVisible && (
        isHandDetected
          ? (
            <span
              className="sdo-pulse"
              style={pill(
                isHandStable
                  ? { background: 'rgba(100,100,100,0.75)', color: '#e5e5e5' }
                  : { background: 'rgba(10,132,255,0.85)', color: '#fff' },
              )}
            >
              {isHandStable ? 'Analyzing…' : 'Hand detected'}
            </span>
          )
          : (
            <span style={pill({ background: 'rgba(100,100,100,0.75)', color: '#e5e5e5' })}>
              Show your hand to sign
            </span>
          )
      )}

      {/* ── sign detected pill ── */}
      {signVisible && displaySign && (
        <span
          key={signKey}
          className="sdo-pop"
          style={pill({
            background: 'rgba(34,197,94,0.92)',
            color:      '#fff',
            fontSize:    18,
            padding:    '8px 20px',
          })}
        >
          {`${displaySign} ${Math.round(displayConfidence * 100)}%`}
        </span>
      )}

    </div>
  );
}

export default SignDetectionOverlay;
