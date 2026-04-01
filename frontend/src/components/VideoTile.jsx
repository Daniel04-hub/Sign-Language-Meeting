/**
 * components/VideoTile.jsx
 *
 * Renders a single participant's video feed inside a styled tile.
 * Handles the following UI states:
 *   - Normal video playback
 *   - Camera turned off → avatar initials fallback
 *   - Mic muted → muted mic icon overlay
 *   - Sign detected → SignBadge overlay (top-right)
 *   - Speaking → blue border pulse
 *
 * Props:
 *   stream       {MediaStream|null}  — media stream (may be null before WebRTC connects)
 *   userName     {string}            — display name shown in the label
 *   isLocal      {boolean}           — true for the local user's tile
 *   isMuted      {boolean}           — true when the user's mic is muted
 *   isCameraOff  {boolean}           — true when the user's camera is off
 *   signDetected {string|null}       — sign name passed to SignBadge
 *   isSpeaking   {boolean}           — true when voice activity is detected
 */

import { useRef, useEffect, useState } from 'react';
import SignBadge from './SignBadge';
import ConnectionQuality from './ConnectionQuality';

/** Generate two-character initials from a display name. */
function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Returns a gradient background from a stable username hash.
 * @param {string} name
 * @returns {string}
 */
function getAvatarColor(name = '') {
  const palettes = [
    ['var(--accent-blue)', 'var(--accent-green)'],
    ['var(--accent-purple)', 'var(--accent-blue)'],
    ['var(--accent-red)', 'var(--accent-purple)'],
    ['var(--accent-green)', 'var(--accent-blue)'],
    ['var(--accent-yellow)', 'var(--accent-red)'],
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }

  const [start, end] = palettes[Math.abs(hash) % palettes.length];
  return `linear-gradient(135deg, ${start}, ${end})`;
}

function VideoTile({
  stream,
  userName  = 'Unknown',
  isLocal   = false,
  isMuted   = false,
  isCameraOff = false,
  signDetected = null,
  isSpeaking   = false,
  isSigning    = false,
  quality      = 'unknown',
}) {
  const videoRef = useRef(null);
  const [isEntering, setIsEntering] = useState(true);

  /** Wire the stream to the <video> element whenever it changes. */
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 400);
    return () => clearTimeout(timer);
  }, []);

  // ── speaking border ────────────────────────────────────────────────
  const truncatedName = userName.length > 20 ? `${userName.slice(0, 20)}…` : userName;

  const tileClasses = [
    'video-tile',
    isSpeaking ? 'speaking' : '',
    isSigning ? 'signing' : '',
    isEntering ? 'video-tile-enter' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={tileClasses}
      role="region"
      aria-label={`${userName}'s video feed`}
      style={{ position: 'relative' }}
    >

      {/* ── video element (always rendered; hidden when camera is off) ── */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}          // avoid echo for local stream
        aria-label={isLocal ? 'Your video' : `${userName}'s video`}
        style={{
          width:      '100%',
          height:     '100%',
          objectFit:  'cover',
          display:    isCameraOff ? 'none' : 'block',
          background: 'var(--bg-secondary)',
        }}
      />

      {/* ── camera-off fallback: avatar initials ── */}
      {isCameraOff && (
        <div
          style={{
            position:        'absolute',
            inset:           0,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            background:      'var(--bg-secondary)',
          }}
        >
          <div
            style={{
              width:          72,
              height:         72,
              borderRadius:   '50%',
              background:     getAvatarColor(userName),
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       28,
              fontWeight:     700,
              color:          '#fff',
              userSelect:     'none',
            }}
          >
            {getInitials(userName)}
          </div>
        </div>
      )}

      {/* ── sign badge (top-right) ── */}
      {signDetected && (
        <>
          <SignBadge sign={signDetected} />
          <span className="visually-hidden">
            {userName} is signing {signDetected}
          </span>
        </>
      )}

      <div style={{ position: 'absolute', top: 8, right: 8 }}>
        <ConnectionQuality quality={quality} showLabel={false} />
      </div>

      {/* ── muted-mic icon overlay ── */}
      {/* ── bottom label: full name + local + muted indicators ── */}
      <div className="tile-label">
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180, display: 'inline-block', verticalAlign: 'middle' }}>
          {truncatedName}{isLocal ? ' (You)' : ''}
        </span>
        {isMuted && (
          <span style={{ marginLeft: 6, opacity: 0.85, fontSize: 11 }} title="Muted" aria-label="Muted">
            <i className="fa-solid fa-microphone-slash" aria-hidden="true" />
          </span>
        )}
      </div>

    </div>
  );
}

export default VideoTile;
