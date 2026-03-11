/**
 * hooks/useWebRTC.js
 *
 * Custom hook that manages the full WebRTC lifecycle for a multi-party
 * video call.  It orchestrates:
 *   • Local media capture (camera + mic)
 *   • Per-peer RTCPeerConnection creation and offer/answer exchange
 *   • ICE candidate trickle
 *   • Mic / camera toggle
 *   • Graceful leave (track stop + peer connection teardown)
 *
 * @param {string}   roomCode    - room identifier (for logging only)
 * @param {string}   userId      - local user's UUID
 * @param {string}   userName    - local user's display name
 * @param {Function} sendMessage - from useWebSocket — sends a WS message
 */

import { useRef, useState, useCallback, useEffect } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302'  },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * useWebRTC
 *
 * @returns {{
 *   participants:          Array<{userId, userName, stream, isLocal}>,
 *   isMicOn:              boolean,
 *   isCameraOn:           boolean,
 *   localVideoRef:        React.MutableRefObject,
 *   initializeMedia:      () => Promise<void>,
 *   toggleMic:            () => void,
 *   toggleCamera:         () => void,
 *   leaveRoom:            () => void,
 *   handleWebSocketMessage: (message: object) => void,
 * }}
 */
export function useWebRTC(roomCode, userId, userName, sendMessage) {
  // ── refs (not reactive — mutation should not trigger renders) ─────────
  const localStream      = useRef(null);
  const peerConnections  = useRef({});   // { [targetUserId]: RTCPeerConnection }
  const localVideoRef    = useRef(null); // passed to the local <video> element
  const sendMessageRef   = useRef(sendMessage);
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ── reactive state ────────────────────────────────────────────────────
  const [participants, setParticipants] = useState([]); // [{userId,userName,stream,isLocal}]
  const [isMicOn,      setIsMicOn]      = useState(true);
  const [isCameraOn,   setIsCameraOn]   = useState(true);

  // ── helpers ───────────────────────────────────────────────────────────

  /**
   * _addParticipant — append or replace a participant entry by userId.
   * Using updater form so callers don't need to capture `participants`.
   * @param {{userId,userName,stream,isLocal}} entry
   */
  const _addParticipant = useCallback((entry) => {
    setParticipants(prev => {
      const without = prev.filter(p => p.userId !== entry.userId);
      return [...without, entry];
    });
  }, []);

  /**
   * _removeParticipant — remove a participant by userId.
   * @param {string} uid
   */
  const _removeParticipant = useCallback((uid) => {
    setParticipants(prev => prev.filter(p => p.userId !== uid));
  }, []);

  // ── media ─────────────────────────────────────────────────────────────

  /**
   * initializeMedia
   *
   * Requests camera + microphone access and stores the stream in
   * `localStream.current`.  Also adds the local user to the participants
   * list and wires up the local <video> srcObject.
   *
   * Must be called once after the component mounts (before joining WS).
   */
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
      });

      localStream.current = stream;

      // Attach to the local video element immediately.
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      _addParticipant({
        userId,
        userName,
        stream,
        isLocal: true,
      });

      console.log('[WebRTC] Local media initialized');
    } catch (err) {
      console.error('[WebRTC] getUserMedia failed:', err);
      // Still add local user without a stream so the UI doesn't hang.
      _addParticipant({ userId, userName, stream: null, isLocal: true });
    }
  }, [userId, userName, _addParticipant]);

  // ── peer connections ──────────────────────────────────────────────────

  /**
   * createPeerConnection
   *
   * Creates and configures an RTCPeerConnection for the given remote user.
   * - Adds all local stream tracks to the connection.
   * - Wires onicecandidate, ontrack, onconnectionstatechange.
   * - Stores the connection in peerConnections.current.
   *
   * @param {string} targetUserId  - remote user's UUID
   * @returns {RTCPeerConnection}
   */
  const createPeerConnection = useCallback((targetUserId) => {
    console.log(`[WebRTC] Creating peer connection → ${targetUserId}`);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks so the remote peer will receive our video/audio.
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current);
      });
    }

    /** onicecandidate — trickle ICE candidates to the remote peer via WS */
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessageRef.current('ice-candidate', {
          target_id: targetUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    /** ontrack — a remote stream track arrived; add/update participant */
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track from ${targetUserId}`, event.streams[0]);
      const remoteStream = event.streams[0];
      if (remoteStream) {
        // Participant name is set later by handleUserJoined/handleNewUser;
        // for now we preserve whatever name is already in state.
        setParticipants(prev => {
          const existing = prev.find(p => p.userId === targetUserId);
          const entry = {
            userId:   targetUserId,
            userName: existing?.userName ?? targetUserId,
            stream:   remoteStream,
            isLocal:  false,
          };
          return [...prev.filter(p => p.userId !== targetUserId), entry];
        });
      }
    };

    /** onconnectionstatechange — clean up on failure */
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state (${targetUserId}):`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        pc.close();
        delete peerConnections.current[targetUserId];
        _removeParticipant(targetUserId);
      }
    };

    peerConnections.current[targetUserId] = pc;
    return pc;
  }, [_removeParticipant]);

  // ── WS message handlers ───────────────────────────────────────────────

  /**
   * handleUserJoined
   *
   * Invoked when the server acknowledges OUR join.
   * `data.existing_users` contains users who are already in the room.
   * We create an offer for each of them so they know we want to connect.
   *
   * @param {{existing_users: Array<{user_id, user_name}>}} data
   */
  const handleUserJoined = useCallback(async (data) => {
    const existingUsers = data.existing_users ?? [];
    console.log('[WebRTC] handleUserJoined — existing:', existingUsers);

    for (const user of existingUsers) {
      // Add placeholder entry so VideoTile renders immediately.
      _addParticipant({ userId: user.user_id, userName: user.user_name, stream: null, isLocal: false });

      const pc = createPeerConnection(user.user_id);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessageRef.current('webrtc-offer', {
          target_id: user.user_id,
          offer:     pc.localDescription.toJSON(),
        });
      } catch (err) {
        console.error('[WebRTC] createOffer failed:', err);
      }
    }
  }, [_addParticipant, createPeerConnection]);

  /**
   * handleNewUser
   *
   * Invoked when ANOTHER user joins the room after us.
   * We just create a peer connection and wait for their offer.
   *
   * @param {{user_id: string, user_name: string}} data
   */
  const handleNewUser = useCallback((data) => {
    console.log('[WebRTC] handleNewUser:', data.user_id, data.user_name);
    _addParticipant({ userId: data.user_id, userName: data.user_name, stream: null, isLocal: false });
    createPeerConnection(data.user_id);
  }, [_addParticipant, createPeerConnection]);

  /**
   * handleWebRTCOffer
   *
   * Receive an offer from a remote peer, set it as the remote description,
   * create an answer, and send it back.
   *
   * @param {{from_id: string, from_name: string, offer: RTCSessionDescriptionInit}} data
   */
  const handleWebRTCOffer = useCallback(async (data) => {
    console.log('[WebRTC] handleWebRTCOffer from:', data.from_id);
    let pc = peerConnections.current[data.from_id];
    if (!pc) {
      // Offer arrived before handleNewUser — create the connection now.
      _addParticipant({ userId: data.from_id, userName: data.from_name ?? data.from_id, stream: null, isLocal: false });
      pc = createPeerConnection(data.from_id);
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendMessageRef.current('webrtc-answer', {
        target_id: data.from_id,
        answer:    pc.localDescription.toJSON(),
      });
    } catch (err) {
      console.error('[WebRTC] handleWebRTCOffer error:', err);
    }
  }, [_addParticipant, createPeerConnection]);

  /**
   * handleWebRTCAnswer
   *
   * Set the remote description after receiving an answer to our offer.
   *
   * @param {{from_id: string, answer: RTCSessionDescriptionInit}} data
   */
  const handleWebRTCAnswer = useCallback(async (data) => {
    console.log('[WebRTC] handleWebRTCAnswer from:', data.from_id);
    const pc = peerConnections.current[data.from_id];
    if (!pc) {
      console.warn('[WebRTC] No peer connection for answer from:', data.from_id);
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (err) {
      console.error('[WebRTC] handleWebRTCAnswer error:', err);
    }
  }, []);

  /**
   * handleIceCandidate
   *
   * Add a trickled ICE candidate received from a remote peer.
   *
   * @param {{from_id: string, candidate: RTCIceCandidateInit}} data
   */
  const handleIceCandidate = useCallback(async (data) => {
    const pc = peerConnections.current[data.from_id];
    if (!pc) {
      console.warn('[WebRTC] No peer connection for ICE candidate from:', data.from_id);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error('[WebRTC] addIceCandidate error:', err);
    }
  }, []);

  /**
   * handleUserLeft
   *
   * Clean up the peer connection and participant entry for a user who
   * disconnected from the room.
   *
   * @param {{user_id: string}} data
   */
  const handleUserLeft = useCallback((data) => {
    console.log('[WebRTC] handleUserLeft:', data.user_id);
    const pc = peerConnections.current[data.user_id];
    if (pc) {
      pc.close();
      delete peerConnections.current[data.user_id];
    }
    _removeParticipant(data.user_id);
  }, [_removeParticipant]);

  // ── control functions ─────────────────────────────────────────────────

  /**
   * toggleMic
   *
   * Mute / unmute the local audio tracks in place.
   * Does not renegotiate — the remote side sees silence vs audio.
   */
  const toggleMic = useCallback(() => {
    if (!localStream.current) return;
    localStream.current.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled;
    });
    setIsMicOn(prev => !prev);
  }, []);

  /**
   * toggleCamera
   *
   * Enable / disable local video tracks in place.
   */
  const toggleCamera = useCallback(() => {
    if (!localStream.current) return;
    localStream.current.getVideoTracks().forEach(track => {
      track.enabled = !track.enabled;
    });
    setIsCameraOn(prev => !prev);
  }, []);

  /**
   * leaveRoom
   *
   * Stop all local tracks, close all peer connections, notify the server.
   * The component should navigate away after calling this.
   */
  const leaveRoom = useCallback(() => {
    // Stop all local media tracks.
    localStream.current?.getTracks().forEach(track => track.stop());
    localStream.current = null;

    // Close all peer connections.
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};

    // Notify server.
    sendMessageRef.current('leave', {});
    console.log('[WebRTC] Left room');
  }, []);

  // ── central WS message router ─────────────────────────────────────────

  /**
   * handleWebSocketMessage
   *
   * Routes every inbound WebSocket message to the appropriate handler.
   * RoomPage passes this as the `onMessage` callback to useWebSocket.
   *
   * @param {{type: string, [key: string]: any}} message
   */
  const handleWebSocketMessage = useCallback((message) => {
    switch (message.type) {
      case 'connected':
        // Server ACK — nothing to do here; RoomPage handles initializeMedia.
        break;
      case 'user-joined':
        handleUserJoined(message);
        break;
      case 'new-user':
        handleNewUser(message);
        break;
      case 'webrtc-offer':
        handleWebRTCOffer(message);
        break;
      case 'webrtc-answer':
        handleWebRTCAnswer(message);
        break;
      case 'ice-candidate':
        handleIceCandidate(message);
        break;
      case 'user-left':
        handleUserLeft(message);
        break;
      default:
        // sign-detected, speech-text, etc. are handled by RoomPage directly.
        break;
    }
  }, [
    handleUserJoined,
    handleNewUser,
    handleWebRTCOffer,
    handleWebRTCAnswer,
    handleIceCandidate,
    handleUserLeft,
  ]);

  // ── cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      localStream.current?.getTracks().forEach(t => t.stop());
      Object.values(peerConnections.current).forEach(pc => pc.close());
    };
  }, []);

  return {
    participants,
    isMicOn,
    isCameraOn,
    localVideoRef,
    initializeMedia,
    toggleMic,
    toggleCamera,
    leaveRoom,
    handleWebSocketMessage,
  };
}
