import { useRef, useState, useCallback, useEffect } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC(roomCode, userId, userName, sendMessage) {
  const localStream = useRef(null);
  const peerConnections = useRef({});
  const localVideoRef = useRef(null);
  const sendMessageRef = useRef(sendMessage);
  const reconnectingPeersRef = useRef(new Set());

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const [participants, setParticipants] = useState([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [mediaError, setMediaError] = useState(null);
  const [participantQuality, setParticipantQuality] = useState({});

  const setQuality = useCallback((targetUserId, quality) => {
    setParticipantQuality((prev) => ({
      ...prev,
      [targetUserId]: quality,
    }));
  }, []);

  const addOrReplaceParticipant = useCallback((entry) => {
    setParticipants((prev) => {
      const merged = prev.filter((p) => p.userId !== entry.userId);
      const current = prev.find((p) => p.userId === entry.userId);
      return [
        ...merged,
        {
          ...current,
          ...entry,
          quality: participantQuality[entry.userId] ?? entry.quality ?? current?.quality ?? 'unknown',
        },
      ];
    });
  }, [participantQuality]);

  const removeParticipant = useCallback((targetUserId) => {
    setParticipants((prev) => prev.filter((p) => p.userId !== targetUserId));
    setParticipantQuality((prev) => {
      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });
  }, []);

  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
      });

      localStream.current = stream;
      setMediaError(null);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      addOrReplaceParticipant({
        userId,
        userName,
        stream,
        isLocal: true,
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        setMediaError({
          type: 'permission',
          message: 'Camera and microphone access denied.',
        });
      } else if (error?.name === 'NotFoundError') {
        setMediaError({
          type: 'device',
          message: 'No camera or microphone found.',
        });
      } else {
        setMediaError({
          type: 'unknown',
          message: error?.message || 'Unknown media error',
        });
      }

      addOrReplaceParticipant({ userId, userName, stream: null, isLocal: true });
      throw error;
    }
  }, [addOrReplaceParticipant, userId, userName]);

  const attemptReconnect = useCallback(async (targetUserId) => {
    if (reconnectingPeersRef.current.has(targetUserId)) {
      return;
    }

    reconnectingPeersRef.current.add(targetUserId);

    try {
      const existing = peerConnections.current[targetUserId];
      if (existing) {
        existing.close();
        delete peerConnections.current[targetUserId];
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });

      console.log('Attempting reconnect to:', targetUserId);
      const pc = createPeerConnection(targetUserId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendMessageRef.current('webrtc-offer', {
        target_id: targetUserId,
        offer: pc.localDescription.toJSON(),
      });
    } catch (error) {
      console.warn('WebRTC reconnect failed for:', targetUserId, error);
    } finally {
      reconnectingPeersRef.current.delete(targetUserId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessageRef.current('ice-candidate', {
          target_id: targetUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (!remoteStream) {
        return;
      }

      setParticipants((prev) => {
        const existing = prev.find((p) => p.userId === targetUserId);
        const next = {
          userId: targetUserId,
          userName: existing?.userName ?? targetUserId,
          stream: remoteStream,
          isLocal: false,
          quality: participantQuality[targetUserId] ?? existing?.quality ?? 'unknown',
        };
        return [...prev.filter((p) => p.userId !== targetUserId), next];
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        setParticipantQuality((prev) => ({
          ...prev,
          [targetUserId]: 'poor',
        }));
        console.warn('Connection failed for:', targetUserId);
        attemptReconnect(targetUserId);
      }

      if (pc.connectionState === 'connected') {
        setParticipantQuality((prev) => ({
          ...prev,
          [targetUserId]: 'good',
        }));
      }
    };

    peerConnections.current[targetUserId] = pc;
    return pc;
  }, [attemptReconnect, participantQuality]);

  const handleUserJoined = useCallback(async (data) => {
    const existingUsers = data.existing_users ?? [];

    for (const user of existingUsers) {
      addOrReplaceParticipant({
        userId: user.user_id,
        userName: user.user_name,
        stream: null,
        isLocal: false,
      });

      setQuality(user.user_id, 'unknown');

      const pc = createPeerConnection(user.user_id);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessageRef.current('webrtc-offer', {
          target_id: user.user_id,
          offer: pc.localDescription.toJSON(),
        });
      } catch (error) {
        console.error('WebRTC: createOffer failed', error);
      }
    }
  }, [addOrReplaceParticipant, createPeerConnection, setQuality]);

  const handleNewUser = useCallback((data) => {
    addOrReplaceParticipant({
      userId: data.user_id,
      userName: data.user_name,
      stream: null,
      isLocal: false,
    });

    setQuality(data.user_id, 'unknown');
    createPeerConnection(data.user_id);
  }, [addOrReplaceParticipant, createPeerConnection, setQuality]);

  const handleWebRTCOffer = useCallback(async (data) => {
    let pc = peerConnections.current[data.from_id];

    if (!pc) {
      addOrReplaceParticipant({
        userId: data.from_id,
        userName: data.from_name ?? data.from_id,
        stream: null,
        isLocal: false,
      });
      setQuality(data.from_id, 'unknown');
      pc = createPeerConnection(data.from_id);
    }

    try {
      const remoteDescription = data.offer ?? data.sdp;
      await pc.setRemoteDescription(new RTCSessionDescription(remoteDescription));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendMessageRef.current('webrtc-answer', {
        target_id: data.from_id,
        answer: pc.localDescription.toJSON(),
      });
    } catch (error) {
      console.error('WebRTC: handleWebRTCOffer failed', error);
    }
  }, [addOrReplaceParticipant, createPeerConnection, setQuality]);

  const handleWebRTCAnswer = useCallback(async (data) => {
    const pc = peerConnections.current[data.from_id];
    if (!pc) {
      return;
    }

    try {
      const remoteDescription = data.answer ?? data.sdp;
      await pc.setRemoteDescription(new RTCSessionDescription(remoteDescription));
    } catch (error) {
      console.error('WebRTC: handleWebRTCAnswer failed', error);
    }
  }, []);

  const handleIceCandidate = useCallback(async (data) => {
    const pc = peerConnections.current[data.from_id];
    if (!pc || !data.candidate) {
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error('WebRTC: addIceCandidate failed', error);
    }
  }, []);

  const handleUserLeft = useCallback((data) => {
    const pc = peerConnections.current[data.user_id];
    if (pc) {
      pc.close();
      delete peerConnections.current[data.user_id];
    }
    removeParticipant(data.user_id);
  }, [removeParticipant]);

  const getConnectionStats = useCallback(() => {
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      pc.getStats().then((stats) => {
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const rtt = (report.currentRoundTripTime ?? 0) * 1000;
            let quality = 'poor';
            if (rtt < 100) {
              quality = 'good';
            } else if (rtt < 300) {
              quality = 'medium';
            }
            setParticipantQuality((prev) => ({
              ...prev,
              [peerId]: quality,
            }));
          }
        });
      }).catch((error) => {
        console.warn('WebRTC stats error:', error);
      });
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      getConnectionStats();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [getConnectionStats]);

  const toggleMic = useCallback(() => {
    if (!localStream.current) {
      return;
    }
    localStream.current.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMicOn((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStream.current) {
      return;
    }
    localStream.current.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsCameraOn((prev) => !prev);
  }, []);

  const leaveRoom = useCallback(() => {
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;

    Object.values(peerConnections.current).forEach((pc) => pc.close());
    peerConnections.current = {};

    sendMessageRef.current('leave', {});
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    switch (message.type) {
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

  useEffect(() => {
    return () => {
      localStream.current?.getTracks().forEach((track) => track.stop());
      Object.values(peerConnections.current).forEach((pc) => pc.close());
    };
  }, []);

  const participantsWithQuality = participants.map((participant) => ({
    ...participant,
    quality: participantQuality[participant.userId] ?? participant.quality ?? 'unknown',
  }));

  return {
    participants: participantsWithQuality,
    isMicOn,
    isCameraOn,
    localVideoRef,
    initializeMedia,
    toggleMic,
    toggleCamera,
    leaveRoom,
    handleWebSocketMessage,
    mediaError,
    setMediaError,
  };
}
