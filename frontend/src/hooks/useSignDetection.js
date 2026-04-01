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
import { startMockDetection, stopMockDetection } from '../utils/mockSignDetection';
import { measureLatency, logPerformance } from '../utils/performance';

/* ── constants ──────────────────────────────────────────────────────────── */

/** Minimum prediction probability accepted as a valid detection. */
const CONFIDENCE_THRESHOLD = 0.75;

/** Minimum gap between *any* two emitted sign events (prevents flicker). */
const MIN_EVENT_GAP_MS = 1200;

/** Require the top class to beat the runner-up by at least this margin. */
const CONFIDENCE_MARGIN = 0.08;

/** Exponential smoothing for landmark jitter (0..1, higher = less smoothing). */
const LANDMARK_SMOOTHING_ALPHA = 0.65;

/** Exponential smoothing for class probabilities (0..1, higher = less smoothing). */
const PROB_SMOOTHING_ALPHA = 0.55;

/** If true, flips Left-hand landmarks to a Right-hand canonical frame. */
// Training scripts include x-flip augmentation; keep inference consistent by
// not applying handedness-based canonicalization.
const CANONICALIZE_LEFT_HAND = false;

/** Minimum milliseconds between two reports of the same sign. */
const DEBOUNCE_MS = 3000;

const IGNORED_SIGNS = ['NOTHING', 'del', 'space'];

/** Target frames per second sent to MediaPipe. */
const CAPTURE_FPS = 10;

/** Class labels — must match training-script output order. */
const SIGN_LABELS = ['HELLO', 'THANKS', 'BYE', 'YES', 'NO'];

/** Smoothing: keep last N predictions, emit majority vote only. */
const SMOOTHING_WINDOW = 5;
const SMOOTHING_MAJORITY = 3;

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
export function useSignDetection(localVideoRef, sendMessage, userId, userName, onLocalSignDetected) {
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
  const lastEventAtRef = useRef(0);
  const recentPredictionsRef = useRef([]);
  const predictionHistoryRef = useRef([]);
  // (legacy) predictionHistoryRef previously enforced consecutive frames.
  // Now we rely on majority-vote smoothing in recentPredictionsRef.
  const previousLandmarksRef = useRef(null);
  const landmarkEmaRef = useRef(null);
  const probEmaRef = useRef(null);
  const stableFrameCountRef = useRef(0);
  const STABILITY_THRESHOLD = 0.02;
  const isProcessingRef = useRef(false);
  const tfRef = useRef(null);
  const memoryCheckIntervalRef = useRef(null);
  const captureTimerRef = useRef(null);
  const frameStatsRef = useRef({
    frameCount: 0,
    lastFpsUpdate: performance.now(),
  });
  const inputBufferRef = useRef(new Float32Array(63));
  const sendRef        = useRef(sendMessage);
  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  /* ── state ──────────────────────────────────────────────────────────── */
  const [isSignModeOn,   setIsSignModeOn]   = useState(false);
  const [currentSign,    setCurrentSign]    = useState(null);
  const [isModelLoaded,  setIsModelLoaded]  = useState(false);
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [isHandStable, setIsHandStable] = useState(false);
  const [mockMode,       setMockMode]       = useState(false);
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const [predictionHistory, setPredictionHistory] = useState([]);
  const [totalPredictions, setTotalPredictions] = useState(0);
  const [fps, setFps] = useState(0);
  const [landmarks,      setLandmarks]      = useState(null);  // for debug canvas

  const checkHandStability = useCallback((currentLandmarks) => {
    if (!previousLandmarksRef.current) {
      previousLandmarksRef.current = currentLandmarks;
      return false;
    }

    let totalMovement = 0;
    for (let i = 0; i < currentLandmarks.length; i++) {
      totalMovement += Math.abs(
        currentLandmarks[i] - previousLandmarksRef.current[i]
      );
    }

    previousLandmarksRef.current = currentLandmarks;
    const avgMovement = totalMovement / currentLandmarks.length;

    return avgMovement < STABILITY_THRESHOLD;
  }, []);

  const smoothLandmarks = useCallback((landmarks63) => {
    if (!landmarkEmaRef.current || landmarkEmaRef.current.length !== landmarks63.length) {
      landmarkEmaRef.current = new Float32Array(landmarks63);
      return landmarkEmaRef.current;
    }

    const prev = landmarkEmaRef.current;
    const a = LANDMARK_SMOOTHING_ALPHA;
    const b = 1 - a;
    for (let i = 0; i < landmarks63.length; i++) {
      prev[i] = a * landmarks63[i] + b * prev[i];
    }
    return prev;
  }, []);

  const updateProbabilityEma = useCallback((probs) => {
    if (!probEmaRef.current || probEmaRef.current.length !== probs.length) {
      probEmaRef.current = Float32Array.from(probs);
      return probEmaRef.current;
    }

    const prev = probEmaRef.current;
    const a = PROB_SMOOTHING_ALPHA;
    const b = 1 - a;
    for (let i = 0; i < probs.length; i++) {
      prev[i] = a * probs[i] + b * prev[i];
    }
    return prev;
  }, []);

  const getTopTwo = useCallback((probs) => {
    let maxIndex = -1;
    let maxVal = -Infinity;
    let secondVal = -Infinity;

    for (let i = 0; i < probs.length; i++) {
      const v = probs[i];
      if (v > maxVal) {
        secondVal = maxVal;
        maxVal = v;
        maxIndex = i;
      } else if (v > secondVal) {
        secondVal = v;
      }
    }

    return { maxIndex, maxVal, secondVal };
  }, []);

  const getTopK = useCallback((probs, k = 3) => {
    const indexed = probs.map((v, i) => ({ i, v }));
    indexed.sort((a, b) => b.v - a.v);
    return indexed.slice(0, k);
  }, []);

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
    const signLower = String(sign ?? '').trim().toLowerCase();
    if (IGNORED_SIGNS.some((s) => s.toLowerCase() === signLower)) {
      return;
    }

    const now = Date.now();

    // Global event gap: prevents rapid sign flicker (e.g., YES/NO oscillation).
    if (now - lastEventAtRef.current < MIN_EVENT_GAP_MS) {
      return;
    }

    // Debounce: skip if same sign within DEBOUNCE_MS.
    if (
      lastSignRef.current.sign === sign &&
      now - lastSignRef.current.timestamp < DEBOUNCE_MS
    ) {
      return;
    }

    lastSignRef.current = { sign, timestamp: now };
  lastEventAtRef.current = now;
    setCurrentSign(sign);
    setCurrentConfidence(confidence);

    if (typeof onLocalSignDetected === 'function') {
      onLocalSignDetected(sign, confidence);
    }

    // Broadcast to all room participants via WebSocket.
    sendMessageStable('sign-detected', {
      sign,
      confidence,
      user_id:   userId,
      user_name: userName,
    });

    console.log(`[SignDetect] Sign detected: ${sign} (${(confidence * 100).toFixed(0)}%)`);
  }, [userId, userName, sendMessageStable, onLocalSignDetected]);

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

  const memoryCheck = useCallback(() => {
    const tfLocal = tfRef.current;
    if (!tfLocal) {
      return;
    }

    const memory = tfLocal.memory();
    if (memory.numTensors > 50) {
      console.warn('TF.js memory warning:', memory);
    }
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
    const tfLocal = tfRef.current;
    if (!modelRef.current || !tfLocal) return;

    const smoothedLandmarks = smoothLandmarks(landmarks63);

    const stable = checkHandStability(smoothedLandmarks);
    setIsHandStable((prev) => (prev === stable ? prev : stable));
    if (!stable) {
      stableFrameCountRef.current = 0;
      probEmaRef.current = null;
      predictionHistoryRef.current = [];
      recentPredictionsRef.current = [];
      setPredictionHistory([]);
      return;
    }

    stableFrameCountRef.current += 1;

    try {
      const result = tfLocal.tidy(() => {
        const scaledLandmarks = applyScaler(smoothedLandmarks);
        inputBufferRef.current.set(scaledLandmarks);

        // Debug: input feature vector shape check
        if (inputBufferRef.current.length !== 63) {
          console.warn('[SignDetect] Unexpected input feature length:', inputBufferRef.current.length);
        }

        const inputTensor = tfLocal.tensor2d(inputBufferRef.current, [1, 63]);
        const predictionTensor = modelRef.current.predict(inputTensor);
        const logits = Array.isArray(predictionTensor) ? predictionTensor[0] : predictionTensor;
        const probs = Array.from(logits.dataSync());
        return { probs };
      });

      const probsRaw = result?.probs;
      if (Array.isArray(probsRaw) && probsRaw.length > 0) {
        const probsEma = updateProbabilityEma(probsRaw);
        const { maxIndex, maxVal, secondVal } = getTopTwo(probsEma);
        const confidence = maxVal;
        const margin = maxVal - secondVal;

        const signName = labelEncoderRef.current?.[
          maxIndex.toString()
        ] || 'UNKNOWN';

        setTotalPredictions((prev) => prev + 1);

        const passesStableFrames = stableFrameCountRef.current >= 2;
        const passesConfidence = confidence >= CONFIDENCE_THRESHOLD;
        const passesMargin = margin >= CONFIDENCE_MARGIN;

        // Debug logs (always available; use console filtering if noisy)
        const top3 = getTopK(probsEma, 3).map(({ i, v }) => ({
          index: i,
          label: labelEncoderRef.current?.[i.toString()] ?? 'UNKNOWN',
          prob: Number(v.toFixed(4)),
        }));
        console.debug('[SignDetect] Prediction frame', {
          inputShape: [1, 63],
          outputLen: probsEma.length,
          top: { index: maxIndex, label: signName, prob: Number(confidence.toFixed(4)) },
          secondProb: Number(secondVal.toFixed(4)),
          margin: Number(margin.toFixed(4)),
          passes: { stable: passesStableFrames, confidence: passesConfidence, margin: passesMargin },
          top3,
        });

        // Only accumulate frames that pass all checks.
        if (!passesStableFrames || !passesConfidence || !passesMargin || signName === 'UNKNOWN') {
          recentPredictionsRef.current = [];
          setPredictionHistory([]);
          return;
        }

        const signLower = signName.toLowerCase();
        if (IGNORED_SIGNS.some((s) => s.toLowerCase() === signLower)) {
          recentPredictionsRef.current = [];
          setPredictionHistory([]);
          return;
        }

        recentPredictionsRef.current.push({ sign: signName, confidence });
        if (recentPredictionsRef.current.length > SMOOTHING_WINDOW) {
          recentPredictionsRef.current.shift();
        }
        setPredictionHistory([...recentPredictionsRef.current]);

        // Majority vote over last N frames.
        const window = recentPredictionsRef.current;
        if (window.length < SMOOTHING_WINDOW) {
          return;
        }

        const counts = new Map();
        for (const item of window) {
          if (!item?.sign) continue;
          counts.set(item.sign, (counts.get(item.sign) ?? 0) + 1);
        }
        let majoritySign = null;
        let majorityCount = 0;
        for (const [sign, count] of counts.entries()) {
          if (count > majorityCount) {
            majorityCount = count;
            majoritySign = sign;
          }
        }

        if (majoritySign && majorityCount >= SMOOTHING_MAJORITY) {
          const votes = window.filter((p) => p.sign === majoritySign);
          const avgConfidence = votes.reduce((sum, p) => sum + (p.confidence ?? 0), 0) / votes.length;

          console.debug('[SignDetect] Smoothed decision', {
            window: window.map((p) => p.sign),
            majoritySign,
            majorityCount,
            avgConfidence: Number(avgConfidence.toFixed(4)),
          });

          onSignDetected(majoritySign, avgConfidence);
          recentPredictionsRef.current = [];
        }
      }
    } catch (err) {
      console.error('[SignDetect] Prediction error:', err);
    }
  }, [onSignDetected, applyScaler, checkHandStability, smoothLandmarks, updateProbabilityEma, getTopTwo, getTopK]);

  /* ──────────────────────────────────────────────────────────────────────
   * processHandResults
   *
   * MediaPipe onResults callback.  Extracts landmarks from the first
   * detected hand and feeds them to the prediction pipeline.
   *
   * @param {object} results  — MediaPipe Hands results object
   * ──────────────────────────────────────────────────────────────────── */
  const processHandResults = useCallback((results) => {
    isProcessingRef.current = true;

    try {
    if (
      !results.multiHandLandmarks ||
      results.multiHandLandmarks.length === 0
    ) {
      setIsHandDetected(false);
      setIsHandStable(false);
      setLandmarks(null);
      recentPredictionsRef.current = [];
      setPredictionHistory([]);
      predictionHistoryRef.current = [];
      previousLandmarksRef.current = null;
      landmarkEmaRef.current = null;
      probEmaRef.current = null;
      stableFrameCountRef.current = 0;
      return;
    }

    setIsHandDetected(true);
    const rawLandmarks = results.multiHandLandmarks[0];
    setLandmarks(rawLandmarks);  // forward to debug canvas

    const landmarks63 = extractLandmarks(rawLandmarks);
    if (CANONICALIZE_LEFT_HAND) {
      const handLabel = results.multiHandedness?.[0]?.label;
      if (handLabel === 'Left') {
        for (let i = 0; i < 21; i++) {
          landmarks63[i * 3] = -landmarks63[i * 3];
        }
      }
    }
    predictSign(landmarks63);
    } finally {
      isProcessingRef.current = false;
    }
  }, [extractLandmarks, predictSign]);

  /* ──────────────────────────────────────────────────────────────────────
   * loadModel
   *
   * Attempts to load the TF.js model from /model/model.json.
   * Falls back to mockMode if the file is missing or loading fails.
   * ──────────────────────────────────────────────────────────────────── */
  const loadModel = useCallback(async () => {
    try {
      if (!tfRef.current) {
        tfRef.current = await import('@tensorflow/tfjs');
      }

      const tfLocal = tfRef.current;
      const model = await tfLocal.loadLayersModel('/model/model.json');

      await loadScaler();
      await loadLabelEncoder();

      // Debug: model I/O shape checks + label mapping sanity.
      const inputShape = model?.inputs?.[0]?.shape;
      const outputShape = model?.outputs?.[0]?.shape;
      const labelCount = labelEncoderRef.current ? Object.keys(labelEncoderRef.current).length : 0;
      console.log('[SignDetect] Model loaded', { inputShape, outputShape, labelCount });
      if (Array.isArray(outputShape) && typeof outputShape[1] === 'number' && labelCount > 0 && outputShape[1] !== labelCount) {
        console.warn('[SignDetect] Model output classes != label mapping count', {
          modelOutputClasses: outputShape[1],
          labelCount,
        });
      }

      // Warm-up pass — avoids first-inference latency spike in the call.
      tfLocal.tidy(() => {
        const dummy = tfLocal.zeros([1, 63]);
        model.predict(dummy);
      });

      modelRef.current = model;
      setIsModelLoaded(true);

      if (memoryCheckIntervalRef.current) {
        clearInterval(memoryCheckIntervalRef.current);
      }
      memoryCheckIntervalRef.current = setInterval(memoryCheck, 30000);

      console.log('[SignDetect] TF.js model loaded successfully');
    } catch (err) {
      console.warn(
        '[SignDetect] Model not found, using mock detection for development:',
        err.message,
      );
      console.warn('[SignDetect] MOCK MODE enabled (random demo predictions).');
      setMockMode(true);
      setIsModelLoaded(true);  // treat mock as "ready"
    }
  }, [loadScaler, loadLabelEncoder, memoryCheck]);

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
        minDetectionConfidence:   0.8,
        minTrackingConfidence:    0.7,
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

    if (captureTimerRef.current != null) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }

    setCurrentSign(null);
    setCurrentConfidence(0);
    setIsHandDetected(false);
    setIsHandStable(false);
    setLandmarks(null);
    recentPredictionsRef.current = [];
    predictionHistoryRef.current = [];
    setPredictionHistory([]);
    setFps(0);
    previousLandmarksRef.current = null;
    landmarkEmaRef.current = null;
    probEmaRef.current = null;
    stableFrameCountRef.current = 0;
    frameStatsRef.current = {
      frameCount: 0,
      lastFpsUpdate: performance.now(),
    };
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
      // Training scripts resize images to 224x224 before extracting landmarks.
      // Keep frontend input consistent to avoid aspect-ratio distortion.
      canvas.width  = 224;
      canvas.height = 224;
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

      if (isProcessingRef.current) {
        captureTimerRef.current = setTimeout(() => {
          if (isRunningRef.current) {
            animFrameRef.current = requestAnimationFrame(captureLoop);
          }
        }, FRAME_INTERVAL);
        return;
      }

      if (video && canvas && hands && video.readyState >= 2) {
        try {
          const frameStart = performance.now();
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          await hands.send({ image: canvas });
          const frameTime = measureLatency(frameStart);
          logPerformance('frame-time', frameTime, 'ms');

          frameStatsRef.current.frameCount += 1;
          const now = performance.now();
          const elapsed = now - frameStatsRef.current.lastFpsUpdate;
          if (elapsed >= 1000) {
            const currentFps = Math.round((frameStatsRef.current.frameCount * 1000) / elapsed);
            setFps(currentFps);
            frameStatsRef.current.frameCount = 0;
            frameStatsRef.current.lastFpsUpdate = now;
          }
        } catch (err) {
          // MediaPipe may throw if the tab is backgrounded — ignore.
          if (isRunningRef.current) {
            console.warn('[SignDetect] Frame send error:', err.message);
          }
        }
      }

      // Schedule next capture at CAPTURE_FPS.
      captureTimerRef.current = setTimeout(() => {
        if (isRunningRef.current) {
          animFrameRef.current = requestAnimationFrame(captureLoop);
        }
      }, FRAME_INTERVAL);
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

      if (memoryCheckIntervalRef.current) {
        clearInterval(memoryCheckIntervalRef.current);
        memoryCheckIntervalRef.current = null;
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
    currentConfidence,
    isModelLoaded,
    isHandDetected,
    isHandStable,
    mockMode,
    predictionHistory,
    totalPredictions,
    fps,
    startSignDetection,
    stopSignDetection,
    canvasRef,
    landmarks,
  };
}
