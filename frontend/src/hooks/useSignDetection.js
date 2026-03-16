/**
 * hooks/useSignDetection.js
 *
 * Custom hook that integrates MediaPipe Hands and a TF.js classification
 * model to detect American Sign Language gestures from the local video
 * stream and broadcast the results via WebSocket.
 *
 * When the TF.js model is unavailable (not yet trained, or loading fails)
 * the hook falls back silently to mock detection — random signs every 3 s
 * — so the full UI pipeline can be tested immediately.
 *
 * @param {React.MutableRefObject} localVideoRef  — ref to the local <video>
 * @param {Function}               sendMessage    — from useWebSocket
 * @param {string}                 userId         — local user's UUID
 * @param {string}                 userName       — local user display name
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import { startMockDetection, stopMockDetection } from '../utils/mockSignDetection';

/* ── constants ──────────────────────────────────────────────────────────── */

/** Minimum prediction probability accepted as a valid detection. */
const CONFIDENCE_THRESHOLD = 0.85;

/** Minimum milliseconds between two reports of the same sign. */
const DEBOUNCE_MS = 2000;

/** Target frames per second sent to MediaPipe. */
const CAPTURE_FPS = 10;

/** Class labels — must match training-script output order. */
const SIGN_LABELS = ['HELLO', 'THANKS', 'BYE', 'YES', 'NO'];

/* ── hook ───────────────────────────────────────────────────────────────── */

/**
 * useSignDetection
 *
 * @returns {{
 *   isSignModeOn:       boolean,
 *   currentSign:        string|null,
 *   isModelLoaded:      boolean,
 *   isHandDetected:     boolean,
 *   startSignDetection: () => Promise<void>,
 *   stopSignDetection:  () => void,
 *   canvasRef:          React.MutableRefObject,
 *   landmarks:          Array|null,
 * }}
 */
export function useSignDetection(localVideoRef, sendMessage, userId, userName) {
  /* ── refs (mutation does not need to trigger renders) ───────────────── */
  const handsRef       = useRef(null);   // MediaPipe Hands instance
  const canvasRef      = useRef(null);   // hidden capture canvas
  const modelRef       = useRef(null);   // loaded tf.LayersModel
  const scalerRef      = useRef(null);   // { mean: number[], scale: number[] }
  const labelEncoderRef = useRef(null);  // { "0": "BYE", ... }
  const isRunningRef   = useRef(false);  // capture loop alive flag
  const animFrameRef   = useRef(null);   // requestAnimationFrame id
  const mockIntervalId = useRef(null);   // setInterval id for mock mode
  const lastSignRef    = useRef({ sign: null, timestamp: 0 });
  const sendRef        = useRef(sendMessage);
  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  /* ── state ──────────────────────────────────────────────────────────── */
  const [isSignModeOn,   setIsSignModeOn]   = useState(false);
  const [currentSign,    setCurrentSign]    = useState(null);
  const [isModelLoaded,  setIsModelLoaded]  = useState(false);
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [mockMode,       setMockMode]       = useState(false);
  const [landmarks,      setLandmarks]      = useState(null);  // for debug canvas

  /* ── sendMessage stable wrapper ─────────────────────────────────────── */
  const sendMessageStable = useCallback((type, data) => {
    sendRef.current?.(type, data);
  }, []);

  /* ──────────────────────────────────────────────────────────────────────
   * onSignDetected
   * Central handler called by both real and mock detection paths.
   *
   * @param {string} sign        — detected sign label
   * @param {number} confidence  — prediction confidence [0, 1]
   * ──────────────────────────────────────────────────────────────────── */
  const onSignDetected = useCallback((sign, confidence) => {
    const now = Date.now();

    // Debounce: skip if same sign within DEBOUNCE_MS.
    if (
      lastSignRef.current.sign === sign &&
      now - lastSignRef.current.timestamp < DEBOUNCE_MS
    ) {
      return;
    }

    lastSignRef.current = { sign, timestamp: now };
    setCurrentSign(sign);

    // Broadcast to all room participants via WebSocket.
    sendMessageStable('sign-detected', {
      sign,
      confidence,
      user_id:   userId,
      user_name: userName,
    });

    console.log(`[SignDetect] Sign detected: ${sign} (${(confidence * 100).toFixed(0)}%)`);
  }, [userId, userName, sendMessageStable]);

  /* ──────────────────────────────────────────────────────────────────────
   * extractLandmarks
   *
   * Converts 21 MediaPipe landmark objects into a normalised Float32Array
   * of 63 values (x, y, z for each point, relative to the wrist).
   *
   * @param {Array<{x:number, y:number, z:number}>} rawLandmarks
   * @returns {Float32Array} length-63 feature vector
   * ──────────────────────────────────────────────────────────────────── */
  const extractLandmarks = useCallback((rawLandmarks) => {
    const wrist = rawLandmarks[0];
    const flat  = new Float32Array(63);

    for (let i = 0; i < 21; i++) {
      const lm = rawLandmarks[i];
      flat[i * 3 + 0] = lm.x - wrist.x;
      flat[i * 3 + 1] = lm.y - wrist.y;
      flat[i * 3 + 2] = lm.z - wrist.z;
    }

    return flat;
  }, []);

  /* ──────────────────────────────────────────────────────────────────────
   * loadScaler
   *
   * Loads StandardScaler parameters exported by train.py from /model/scaler.json
   * and stores them in scalerRef for client-side feature normalization.
   * ──────────────────────────────────────────────────────────────────── */
  const loadScaler = useCallback(async () => {
    const response = await fetch('/model/scaler.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to load scaler.json (${response.status})`);
    }

    const payload = await response.json();
    const mean = Array.isArray(payload?.mean) ? payload.mean : null;
    const scale = Array.isArray(payload?.scale) ? payload.scale : null;

    if (!mean || !scale || mean.length !== 63 || scale.length !== 63) {
      throw new Error('Invalid scaler.json format');
    }

    scalerRef.current = { mean, scale };
    console.log('[SignDetect] Scaler loaded successfully');
  }, []);

  /* ──────────────────────────────────────────────────────────────────────
   * loadLabelEncoder
   *
   * Loads model-output index mapping from /model/label_encoder.json
   * so frontend sign names always match training-time label encoding.
   * ──────────────────────────────────────────────────────────────────── */
  const loadLabelEncoder = useCallback(async () => {
    const response = await fetch('/model/label_encoder.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to load label_encoder.json (${response.status})`);
    }

    const payload = await response.json();
    const mapping = payload?.mapping;

    if (!mapping || typeof mapping !== 'object') {
      throw new Error('Invalid label_encoder.json format');
    }

    labelEncoderRef.current = mapping;
    console.log('[SignDetect] Label encoder loaded successfully');
  }, []);

  /* ──────────────────────────────────────────────────────────────────────
   * applyScaler
   *
   * Applies (x - mean) / scale normalization to a 63-feature vector.
   * If scaler data is unavailable, returns the original vector.
   * ──────────────────────────────────────────────────────────────────── */
  const applyScaler = useCallback((landmarks63) => {
    const scaler = scalerRef.current;
    if (!scaler || !Array.isArray(scaler.mean) || !Array.isArray(scaler.scale)) {
      return landmarks63;
    }

    const normalized = new Float32Array(63);
    for (let i = 0; i < 63; i++) {
      const denominator = scaler.scale[i] === 0 ? 1 : scaler.scale[i];
      normalized[i] = (landmarks63[i] - scaler.mean[i]) / denominator;
    }
    return normalized;
  }, []);

  /* ──────────────────────────────────────────────────────────────────────
   * predictSign
   *
   * Runs the TF.js model on the 63-value landmark vector and calls
   * onSignDetected if confidence clears the threshold.
   * All tensor allocations are wrapped in tf.tidy() to prevent leaks.
   *
   * @param {Float32Array} landmarks63
   * ──────────────────────────────────────────────────────────────────── */
  const predictSign = useCallback((landmarks63) => {
    if (!modelRef.current) return;

    try {
      const result = tf.tidy(() => {
        const scaledLandmarks = applyScaler(landmarks63);
        const tensor      = tf.tensor2d([Array.from(scaledLandmarks)], [1, 63]);
        const prediction  = modelRef.current.predict(tensor);
        const probs       = prediction.dataSync();
        const maxIndex    = probs.indexOf(Math.max(...probs));
        const confidence  = probs[maxIndex];
        const mappedSign = labelEncoderRef.current?.[maxIndex.toString()];
        return { sign: mappedSign || SIGN_LABELS[maxIndex], confidence };
      });

      if (result && result.confidence >= CONFIDENCE_THRESHOLD) {
        onSignDetected(result.sign, result.confidence);
      }
    } catch (err) {
      console.error('[SignDetect] Prediction error:', err);
    }
  }, [onSignDetected, applyScaler]);

  /* ──────────────────────────────────────────────────────────────────────
   * processHandResults
   *
   * MediaPipe onResults callback.  Extracts landmarks from the first
   * detected hand and feeds them to the prediction pipeline.
   *
   * @param {object} results  — MediaPipe Hands results object
   * ──────────────────────────────────────────────────────────────────── */
  const processHandResults = useCallback((results) => {
    if (
      !results.multiHandLandmarks ||
      results.multiHandLandmarks.length === 0
    ) {
      setIsHandDetected(false);
      setLandmarks(null);
      return;
    }

    setIsHandDetected(true);
    const rawLandmarks = results.multiHandLandmarks[0];
    setLandmarks(rawLandmarks);  // forward to debug canvas

    const landmarks63 = extractLandmarks(rawLandmarks);
    predictSign(landmarks63);
  }, [extractLandmarks, predictSign]);

  /* ──────────────────────────────────────────────────────────────────────
   * loadModel
   *
   * Attempts to load the TF.js model from /model/model.json.
   * Falls back to mockMode if the file is missing or loading fails.
   * ──────────────────────────────────────────────────────────────────── */
  const loadModel = useCallback(async () => {
    try {
      const model = await tf.loadLayersModel('/model/model.json');

      await loadScaler();
      await loadLabelEncoder();

      // Warm-up pass — avoids first-inference latency spike in the call.
      tf.tidy(() => {
        const dummy = tf.zeros([1, 63]);
        model.predict(dummy);
      });

      modelRef.current = model;
      setIsModelLoaded(true);
      console.log('[SignDetect] TF.js model loaded successfully');
    } catch (err) {
      console.warn(
        '[SignDetect] Model not found, using mock detection for development:',
        err.message,
      );
      setMockMode(true);
      setIsModelLoaded(true);  // treat mock as "ready"
    }
  }, [loadScaler, loadLabelEncoder]);

  /* ──────────────────────────────────────────────────────────────────────
   * initMediaPipe
   *
   * Dynamically imports and configures the MediaPipe Hands pipeline.
   * Dynamic import avoids loading the heavy WASM bundle until the user
   * intentionally activates sign mode.
   * ──────────────────────────────────────────────────────────────────── */
  const initMediaPipe = useCallback(async () => {
    try {
      const { Hands } = await import('@mediapipe/hands');

      const hands = new Hands({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      hands.setOptions({
        maxNumHands:              1,
        modelComplexity:          1,
        minDetectionConfidence:   0.7,
        minTrackingConfidence:    0.5,
      });

      hands.onResults(processHandResults);

      // Initialise the WASM pipeline eagerly.
      await hands.initialize();

      handsRef.current = hands;
      console.log('[SignDetect] MediaPipe Hands initialised');
    } catch (err) {
      console.error('[SignDetect] MediaPipe init failed:', err);
      // Fall back to mock mode so UI still works.
      setMockMode(true);
    }
  }, [processHandResults]);

  /* ──────────────────────────────────────────────────────────────────────
   * stopCapture
   *
   * Halts the capture loop and resets transient detection state.
   * ──────────────────────────────────────────────────────────────────── */
  const stopCapture = useCallback(() => {
    isRunningRef.current = false;

    if (animFrameRef.current != null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    setCurrentSign(null);
    setIsHandDetected(false);
    setLandmarks(null);
  }, []);

  /* ──────────────────────────────────────────────────────────────────────
   * startCapture
   *
   * Ensures the hidden canvas exists, then starts a requestAnimationFrame
   * loop that draws each video frame to the canvas and forwards it to
   * MediaPipe Hands at CAPTURE_FPS.
   * ──────────────────────────────────────────────────────────────────── */
  const startCapture = useCallback(() => {
    if (isRunningRef.current) return;

    // Create the hidden canvas once.
    if (!canvasRef.current) {
      const canvas  = document.createElement('canvas');
      canvas.width  = 640;
      canvas.height = 480;
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
      canvasRef.current = canvas;
    }

    isRunningRef.current = true;
    const FRAME_INTERVAL = 1000 / CAPTURE_FPS;   // 100 ms at 10 fps

    /** captureLoop — draws video → canvas → MediaPipe at capped fps */
    const captureLoop = async () => {
      if (!isRunningRef.current) return;

      const video  = localVideoRef?.current;
      const canvas = canvasRef.current;
      const hands  = handsRef.current;

      if (video && canvas && hands && video.readyState >= 2) {
        try {
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          await hands.send({ image: canvas });
        } catch (err) {
          // MediaPipe may throw if the tab is backgrounded — ignore.
          if (isRunningRef.current) {
            console.warn('[SignDetect] Frame send error:', err.message);
          }
        }
      }

      // Schedule next capture at CAPTURE_FPS.
      const id = setTimeout(() => {
        if (isRunningRef.current) {
          animFrameRef.current = requestAnimationFrame(captureLoop);
        }
      }, FRAME_INTERVAL);

      // Store setTimeout id so stopCapture can cancel it if needed.
      animFrameRef.current = id;
    };

    animFrameRef.current = requestAnimationFrame(captureLoop);
    console.log('[SignDetect] Capture loop started');
  }, [localVideoRef]);

  /* ──────────────────────────────────────────────────────────────────────
   * startSignDetection
   *
   * Public entry point.  Loads the model and MediaPipe (if not already
   * ready), then starts the capture loop or mock fallback.
   * ──────────────────────────────────────────────────────────────────── */
  const startSignDetection = useCallback(async () => {
    try {
      // Ensure model + MediaPipe are initialised.
      if (!isModelLoaded) {
        await loadModel();
      }
      if (!handsRef.current) {
        await initMediaPipe();
      }

      // If mock mode was triggered during init, use mock instead of capture.
      if (mockMode || !handsRef.current) {
        mockIntervalId.current = startMockDetection(onSignDetected);
        setIsSignModeOn(true);
        setIsModelLoaded(true);
        return;
      }

      startCapture();
      setIsSignModeOn(true);
    } catch (err) {
      console.error('[SignDetect] startSignDetection error:', err);
      // Always fall back to mock so the UI stays functional.
      mockIntervalId.current = startMockDetection(onSignDetected);
      setMockMode(true);
      setIsModelLoaded(true);
      setIsSignModeOn(true);
    }
  }, [isModelLoaded, mockMode, loadModel, initMediaPipe, startCapture, onSignDetected]);

  /* ──────────────────────────────────────────────────────────────────────
   * stopSignDetection
   *
   * Halts all detection (real or mock) and resets sign mode state.
   * ──────────────────────────────────────────────────────────────────── */
  const stopSignDetection = useCallback(() => {
    stopCapture();
    stopMockDetection(mockIntervalId.current);
    mockIntervalId.current = null;
    setIsSignModeOn(false);
    console.log('[SignDetect] Sign detection stopped');
  }, [stopCapture]);

  /* ── cleanup on unmount ─────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      stopCapture();
      stopMockDetection(mockIntervalId.current);

      // Remove the hidden canvas from the DOM if we created it.
      if (canvasRef.current && canvasRef.current.parentNode) {
        canvasRef.current.parentNode.removeChild(canvasRef.current);
      }

      // Clean up TF.js memory.
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }

      // Close MediaPipe Hands pipeline.
      if (handsRef.current) {
        handsRef.current.close?.();
        handsRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isSignModeOn,
    currentSign,
    isModelLoaded,
    isHandDetected,
    startSignDetection,
    stopSignDetection,
    canvasRef,
    landmarks,
  };
}
