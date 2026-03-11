/**
 * components/HandLandmarkCanvas.jsx
 *
 * Development-only debug canvas that draws MediaPipe hand skeleton
 * landmarks over the live video feed.  Renders ONLY in dev mode
 * (import.meta.env.DEV === true).  Returns null in production.
 *
 * Props:
 *   isSignModeOn {boolean}          — only draw when detection is active
 *   landmarks    {Array|null}       — 21 MediaPipe landmark objects
 *                                     [{x, y, z}, …] in normalised coords
 *   videoWidth   {number}           — source video width  (default 640)
 *   videoHeight  {number}           — source video height (default 480)
 *
 * The canvas is displayed at 200 × 150 px in the bottom-left corner.
 * A "Debug" toggle button lets the developer hide it without disabling
 * sign detection.
 */

import { useRef, useEffect, useState } from 'react';

/* ── Unconditionally import drawing utils (tree-shaken in prod) ─────────── */
// We use dynamic imports inside useEffect to avoid crashing in environments
// where canvas is unavailable (SSR, tests).

const CANVAS_W = 200;
const CANVAS_H = 150;

// MediaPipe hand connections (pairs of landmark indices that form the skeleton).
// Copied from the MediaPipe JS source for zero CDN dependency here.
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

/**
 * drawSkeleton
 *
 * Draws the hand skeleton onto the 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, y:number}>} lm  — 21 normalised landmark points
 * @param {number} w  — canvas pixel width
 * @param {number} h  — canvas pixel height
 */
function drawSkeleton(ctx, lm, w, h) {
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, w, h);

  // Connections
  ctx.strokeStyle = '#3B82F6';
  ctx.lineWidth   = 1.5;
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }

  // Landmarks
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, i === 0 ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? '#F59E0B' : '#22C55E';
    ctx.fill();
  }
}

function HandLandmarkCanvas({ isSignModeOn = false, landmarks = null }) {
  // Only render in development builds.
  if (!import.meta.env.DEV) return null;

  return <HandLandmarkCanvasInner isSignModeOn={isSignModeOn} landmarks={landmarks} />;
}

/** Inner component — always mounts in DEV so hooks are called unconditionally. */
function HandLandmarkCanvasInner({ isSignModeOn, landmarks }) {
  const canvasRef   = useRef(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!visible || !isSignModeOn || !landmarks || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    drawSkeleton(ctx, landmarks, CANVAS_W, CANVAS_H);
  }, [landmarks, isSignModeOn, visible]);

  // Clear canvas when sign mode turns off.
  useEffect(() => {
    if (!isSignModeOn && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }, [isSignModeOn]);

  return (
    <div
      style={{
        position:     'fixed',
        bottom:       90,
        left:         12,
        zIndex:       900,
        display:      'flex',
        flexDirection: 'column',
        gap:           4,
        pointerEvents: 'auto',
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setVisible(v => !v)}
        style={{
          fontSize:     11,
          padding:      '2px 8px',
          borderRadius: 4,
          border:       '1px solid #48484A',
          background:   'rgba(0,0,0,0.6)',
          color:        '#ccc',
          cursor:       'pointer',
          alignSelf:    'flex-start',
        }}
      >
        {visible ? 'Hide' : 'Show'} Debug
      </button>

      {/* Canvas */}
      {visible && isSignModeOn && (
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            borderRadius: 8,
            border:       '1px solid #48484A',
            display:      'block',
          }}
        />
      )}
    </div>
  );
}

export default HandLandmarkCanvas;
