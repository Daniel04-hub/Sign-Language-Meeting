/**
 * hooks/useWebSocket.js
 *
 * Persistent WebSocket hook with robust reconnection and status tracking.
 */

import { useRef, useState, useEffect, useCallback } from 'react';

function buildWsUrl(roomCode) {
  if (import.meta.env.DEV) {
    return `ws://localhost:8000/ws/room/${roomCode}/`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/room/${roomCode}/`;
}

export function useWebSocket(roomCode, userId, userName, onMessage) {
  const socket = useRef(null);
  const onMessageRef = useRef(onMessage);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef(null);
  const maxReconnectAttempts = 5;
  const isIntentionalClose = useRef(false);
  const mountedRef = useRef(true);

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [reconnectAttemptCount, setReconnectAttemptCount] = useState(0);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const sendMessage = useCallback((type, data = {}) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type, user_id: userId, ...data }));
      return;
    }
    console.warn('WebSocket: Cannot send message, socket not open', type);
  }, [userId]);

  const connect = useCallback(() => {
    if (!roomCode || !userId || !userName) {
      return;
    }

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    setConnectionStatus('connecting');

    if (socket.current) {
      socket.current.onclose = null;
      socket.current.close();
    }

    const ws = new WebSocket(buildWsUrl(roomCode));
    socket.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }

      reconnectAttempts.current = 0;
      setReconnectAttemptCount(0);
      setIsConnected(true);
      setConnectionStatus('connected');

      sendMessage('join', {
        room_code: roomCode,
        user_id: userId,
        user_name: userName,
      });
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onMessageRef.current?.(parsed);
      } catch (error) {
        console.error('WebSocket: Failed to parse incoming message', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket: Socket error', error);
    };

    ws.onclose = () => {
      setIsConnected(false);

      if (!mountedRef.current) {
        return;
      }

      if (isIntentionalClose.current) {
        return;
      }

      setConnectionStatus('disconnected');

      if (reconnectAttempts.current >= maxReconnectAttempts) {
        setConnectionStatus('failed');
        console.error('WebSocket: Max reconnect attempts reached');
        return;
      }

      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempts.current),
        16000,
      );

      reconnectAttempts.current += 1;
      setReconnectAttemptCount(reconnectAttempts.current);

      console.log(
        'WebSocket: Reconnecting in',
        delay,
        'ms',
        'attempt',
        reconnectAttempts.current,
      );

      setConnectionStatus('reconnecting');

      reconnectTimer.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [roomCode, userId, userName, sendMessage]);

  const reconnect = useCallback(() => {
    isIntentionalClose.current = false;
    reconnectAttempts.current = 0;
    setReconnectAttemptCount(0);
    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    isIntentionalClose.current = true;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (socket.current) {
      socket.current.close();
    }
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    isIntentionalClose.current = false;
    connect();

    return () => {
      mountedRef.current = false;
      isIntentionalClose.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (socket.current) {
        socket.current.onclose = null;
        socket.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    sendMessage,
    reconnect,
    disconnect,
    connectionStatus,
    reconnectAttempts: reconnectAttemptCount,
  };
}
