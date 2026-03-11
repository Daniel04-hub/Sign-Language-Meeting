/**
 * hooks/useWebSocket.js
 *
 * Custom hook that manages a persistent WebSocket connection to the
 * SignMeet backend.  Handles automatic exponential-backoff reconnection,
 * join handshake, and exposes a stable `sendMessage` helper.
 *
 * @param {string}   roomCode   - 8-character room identifier
 * @param {string}   userId     - UUID identifying the local user
 * @param {string}   userName   - display name of the local user
 * @param {Function} onMessage  - callback(parsedObject) invoked on every
 *                                inbound message
 */

import { useRef, useState, useEffect, useCallback } from 'react';

const MAX_RETRIES      = 5;
const BASE_DELAY_MS    = 1000;   // 1 s → 2 s → 4 s → 8 s → 16 s

/** Build the WebSocket URL from the current host in production,
 *  or fall back to localhost:8000 in development (Vite proxy). */
function buildWsUrl(roomCode) {
  if (import.meta.env.DEV) {
    return `ws://localhost:8000/ws/room/${roomCode}/`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/room/${roomCode}/`;
}

/**
 * useWebSocket
 *
 * @returns {{
 *   isConnected: boolean,
 *   sendMessage: (type: string, data?: object) => void,
 *   reconnect:   () => void,
 * }}
 */
export function useWebSocket(roomCode, userId, userName, onMessage) {
  const socketRef    = useRef(null);
  const retriesRef   = useRef(0);
  const mountedRef   = useRef(true);
  const onMessageRef = useRef(onMessage);

  // Keep the callback ref fresh so consumers can pass an inline function
  // without triggering a reconnect.
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const [isConnected, setIsConnected] = useState(false);

  /** ------------------------------------------------------------------ *
   * connect()
   * Opens a new WebSocket and wires up all event handlers.
   * -------------------------------------------------------------------- */
  const connect = useCallback(() => {
    if (!roomCode || !userId || !userName) return;

    // Tear down any stale socket before creating a new one.
    if (socketRef.current) {
      socketRef.current.onclose = null;   // prevent recursive reconnect
      socketRef.current.close();
    }

    const url = buildWsUrl(roomCode);
    console.log(`[WS] Connecting → ${url}  (attempt ${retriesRef.current + 1})`);

    const ws = new WebSocket(url);
    socketRef.current = ws;

    /** onopen — send join message immediately */
    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      console.log('[WS] Connection opened');
      retriesRef.current = 0;
      setIsConnected(true);

      ws.send(JSON.stringify({
        type:      'join',
        room_code: roomCode,
        user_id:   userId,
        user_name: userName,
      }));
    };

    /** onmessage — parse JSON and call consumer callback */
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS] ←', data.type, data);
        onMessageRef.current?.(data);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err, event.data);
      }
    };

    /** onerror — log and mark disconnected */
    ws.onerror = (err) => {
      console.error('[WS] Socket error:', err);
      setIsConnected(false);
    };

    /** onclose — attempt exponential-backoff reconnect */
    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      console.warn(`[WS] Closed (code=${event.code}, clean=${event.wasClean})`);

      // 4xxx codes are intentional (room not found, room full, user left).
      if (event.code >= 4000 && event.code < 5000) {
        console.info('[WS] Server closed connection intentionally — not retrying');
        return;
      }

      if (retriesRef.current < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retriesRef.current);
        console.info(`[WS] Reconnecting in ${delay}ms (retry ${retriesRef.current + 1}/${MAX_RETRIES})`);
        retriesRef.current += 1;
        setTimeout(() => {
          if (mountedRef.current) connect();
        }, delay);
      } else {
        console.error('[WS] Max retries reached. Giving up.');
      }
    };
  }, [roomCode, userId, userName]); // eslint-disable-line react-hooks/exhaustive-deps

  /** ------------------------------------------------------------------ *
   * Mount / unmount lifecycle
   * -------------------------------------------------------------------- */
  useEffect(() => {
    mountedRef.current = true;
    retriesRef.current = 0;
    connect();

    return () => {
      mountedRef.current = false;
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close(1000, 'Component unmounted');
      }
    };
  }, [connect]);

  /** ------------------------------------------------------------------ *
   * sendMessage(type, data)
   *
   * Serialises and sends a JSON message over the open socket.
   * Silently drops the message if the socket is not OPEN.
   *
   * @param {string} type  - WS message type (e.g. "webrtc-offer")
   * @param {object} data  - additional payload merged into the envelope
   * -------------------------------------------------------------------- */
  const sendMessage = useCallback((type, data = {}) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify({ type, user_id: userId, ...data });
      console.log('[WS] →', type, data);
      socketRef.current.send(payload);
    } else {
      console.warn('[WS] sendMessage called but socket is not open (state=',
        socketRef.current?.readyState, ')');
    }
  }, [userId]);

  /** ------------------------------------------------------------------ *
   * reconnect()
   *
   * Public method: lets consumers trigger a manual reconnect attempt,
   * e.g. after a user-visible "Reconnect" button click.
   * -------------------------------------------------------------------- */
  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    connect();
  }, [connect]);

  return { isConnected, sendMessage, reconnect };
}
