/**
 * components/VideoGrid.jsx
 *
 * Lays out all participant VideoTile components in a CSS grid.
 * The grid class (e.g. `participants-2`) is applied dynamically so
 * index.css can define optimal layouts for 1–8 participants.
 *
 * Props:
 *   participants   {Array<{userId, userName, stream, isLocal}>}
 *   localVideoRef  {React.MutableRefObject}   — passed to the local tile's <video>
 *   signDetections {Object.<string, string>}  — { [userId]: signText }
 *   isMicOn        {boolean}                  — local mic state (for local tile muted icon)
 *   isCameraOn     {boolean}                  — local cam state (for local tile camera-off)
 */

import VideoTile from './VideoTile';

function VideoGrid({
  participants   = [],
  signDetections = {},
  isMicOn        = true,
  isCameraOn     = true,
}) {
  // Clamp count to 1–8 for the CSS class.
  const count     = Math.max(1, Math.min(participants.length, 8));
  const gridClass = `video-grid participants-${count}`;

  return (
    <div className={gridClass}>
      {participants.map(participant => (
        <VideoTile
          key={participant.userId}
          stream={participant.stream}
          userName={participant.userName}
          isLocal={participant.isLocal}
          isMuted={participant.isLocal ? !isMicOn    : false}
          isCameraOff={participant.isLocal ? !isCameraOn : false}
          signDetected={signDetections[participant.userId] ?? null}
          isSpeaking={false}   /* voice-activity detection added in Batch 3 */
        />
      ))}

      {/* Placeholder tiles when the grid has fewer participants than
          the minimum layout slot (keeps the grid from collapsing). */}
      {participants.length === 0 && (
        <div
          style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            height:          180,
            borderRadius:    12,
            background:      'var(--bg-secondary)',
            color:           'var(--text-secondary)',
            gridColumn:      '1 / -1',
          }}
        >
          Waiting for participants…
        </div>
      )}
    </div>
  );
}

export default VideoGrid;
