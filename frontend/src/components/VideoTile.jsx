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

import { useRef, useEffect } from 'react';
import SignBadge from './SignBadge';

/** Generate two-character initials from a display name. */
function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function VideoTile({
  stream,
  userName  = 'Unknown',
  isLocal   = false,
  isMuted   = false,
  isCameraOff = false,
  signDetected = null,
  isSpeaking   = false,
}) {
  const videoRef = useRef(null);

  /** Wire the stream to the <video> element whenever it changes. */
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // ── speaking border ────────────────────────────────────────────────
  const speakingStyle = isSpeaking
    ? { boxShadow: '0 0 0 3px #3B82F6, 0 0 12px 3px rgba(59,130,246,0.45)' }
    : {};

  return (
    <div
      className="video-tile"
      style={{ position: 'relative', ...speakingStyle }}
    >

      {/* ── video element (always rendered; hidden when camera is off) ── */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}          // avoid echo for local stream
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
              background:     'var(--accent-purple)',
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
      {signDetected && <SignBadge sign={signDetected} />}

      {/* ── muted-mic icon overlay ── */}
      {isMuted && (
        <span
          title="Microphone muted"
          style={{
            position:  'absolute',
            bottom:    36,
            left:      10,
            fontSize:  18,
            lineHeight: 1,
          }}
        >
          🔇
        </span>
      )}

      {/* ── bottom label: name + (You) badge ── */}
      <div className="tile-label">
        <span>{userName}</span>
        {isLocal && (
          <span
            style={{
              marginLeft:   6,
              fontSize:     11,
              padding:      '1px 5px',
              borderRadius: 4,
              background:   'rgba(59,130,246,0.6)',
            }}
          >
            You
          </span>
        )}
      </div>

    </div>
  );
}

export default VideoTile;
