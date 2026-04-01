/**
 * components/ParticipantSidebar.jsx
 *
 * Slide-in sidebar listing call participants and live status indicators.
 */

/**
 * Returns initials from a participant display name.
 * @param {string} name
 * @returns {string}
 */
function getInitials(name = '') {
  const trimmed = name.trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * ParticipantSidebar component.
 * @param {Object} props
 * @param {Array} props.participants
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {string} props.localUserId
 * @returns {JSX.Element}
 */
function ParticipantSidebar({
  participants = [],
  isOpen,
  onClose,
  localUserId,
}) {
  return (
    <div className={`participant-sidebar${isOpen ? ' open' : ''}`}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h6 className="mb-0">In this call ({participants.length})</h6>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary py-0 px-2"
          onClick={onClose}
          aria-label="Close participant list"
        >
          X
        </button>
      </div>

      {participants.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 16 }}>
          No one else is here yet
        </p>
      )}

      {participants.map((participant) => {
        const isLocal = participant.userId === localUserId;
        const displayName = isLocal ? `${participant.userName} (you)` : participant.userName;

        return (
          <div key={participant.userId} className="participant-item">
            <div className="participant-avatar">{getInitials(participant.userName)}</div>
            <div className="participant-name" title={displayName}>{displayName}</div>
            <div className="participant-status" aria-label="Participant status indicators">
              <span style={{ color: participant.isMuted ? 'var(--text-secondary)' : 'white' }} title={participant.isMuted ? 'Muted' : 'Mic on'}>
                <i className={participant.isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone'} aria-hidden="true" />
              </span>
              <span style={{ color: participant.isCameraOff ? 'var(--text-secondary)' : 'white' }} title={participant.isCameraOff ? 'Camera off' : 'Camera on'}>
                <i className={participant.isCameraOff ? 'fa-solid fa-video-slash' : 'fa-solid fa-video'} aria-hidden="true" />
              </span>
              <span style={{ color: participant.isSigning ? 'var(--accent-purple)' : 'var(--text-secondary)' }} title={participant.isSigning ? 'Signing' : 'Not signing'}>
                <i className="fa-solid fa-hands-asl-interpreting" aria-hidden="true" />
              </span>
              <span style={{ color: participant.isSpeaking ? 'var(--accent-blue)' : 'var(--text-secondary)' }} title={participant.isSpeaking ? 'Speaking' : 'Not speaking'}>
                <i className="fa-solid fa-comment-dots" aria-hidden="true" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ParticipantSidebar;
