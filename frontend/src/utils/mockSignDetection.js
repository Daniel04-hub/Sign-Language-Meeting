/**
 * utils/mockSignDetection.js
 *
 * Mock sign-detection engine for UI development and testing.
 * Use this whenever the real TF.js model is unavailable
 * (e.g. before training, or when running offline).
 *
 * The module exposes two functions:
 *   startMockDetection(onSignCallback, intervalMs?)
 *   stopMockDetection(intervalId)
 *
 * Both functions are pure — they do not touch React state or refs,
 * so the hook can choose when to call the callback.
 */

/** All sign labels the production model will also output. */
export const MOCK_SIGNS = ['HELLO', 'THANKS', 'BYE', 'YES', 'NO'];

/**
 * startMockDetection
 *
 * Starts a repeating interval that picks a random sign from MOCK_SIGNS
 * and calls `onSignCallback` with a random high-confidence score.
 * Simulates the cadence of real-world sign detection.
 *
 * @param {(sign: string, confidence: number) => void} onSignCallback
 *   Called once per interval with (signLabel, normalised_confidence).
 * @param {number} [intervalMs=3000]
 *   How often to fire a mock detection.  Defaults to 3 000 ms.
 * @returns {number} The interval ID — pass it to stopMockDetection() to cancel.
 *
 * @example
 *   const id = startMockDetection((sign, conf) => {
 *     console.log(`Mock: ${sign}  conf=${conf.toFixed(2)}`);
 *   });
 *   // later …
 *   stopMockDetection(id);
 */
export function startMockDetection(onSignCallback, intervalMs = 3000) {
  const id = setInterval(() => {
    const sign       = MOCK_SIGNS[Math.floor(Math.random() * MOCK_SIGNS.length)];
    // Random confidence in range [0.86, 0.99]
    const confidence = parseFloat((0.86 + Math.random() * 0.13).toFixed(2));
    onSignCallback(sign, confidence);
  }, intervalMs);

  console.log(`[MockSign] Started — firing every ${intervalMs}ms (id=${id})`);
  return id;
}

/**
 * stopMockDetection
 *
 * Cancels a mock detection interval created by startMockDetection.
 *
 * @param {number} intervalId  — the ID returned by startMockDetection.
 */
export function stopMockDetection(intervalId) {
  if (intervalId != null) {
    clearInterval(intervalId);
    console.log(`[MockSign] Stopped (id=${intervalId})`);
  }
}
