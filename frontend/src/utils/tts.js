/**
 * utils/tts.js
 *
 * Cross-browser Text-to-Speech helpers for sign announcements.
 * Supports enable/disable, volume control, cancellation, and priority playback.
 */

let ttsVolume = 1.0;
let ttsEnabled = true;

let lastSpokenSign = null;
let lastSpokenTime = 0;
const SIGN_SPEAK_COOLDOWN = 4000;

const SIGN_PHRASES = (() => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').reduce((acc, letter) => {
    acc[letter] = letter;
    return acc;
  }, {});

  return {
    ...letters,
    HELLO: 'Hello',
    THANKS: 'Thank you',
    BYE: 'Goodbye',
    YES: 'Yes',
    NO: 'No',
  };
})();

/**
 * Returns whether the Web Speech synthesis API is available.
 * @returns {boolean}
 */
function isSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Cancels any currently queued/playing speech.
 * @returns {void}
 */
export function cancelSpeech() {
  try {
    if (!isSynthesisSupported()) return;
    window.speechSynthesis.cancel();
  } catch (error) {
    console.warn('TTS: cancelSpeech failed:', error);
  }
}

/**
 * Returns whether speech synthesis is currently speaking.
 * @returns {boolean}
 */
export function isSpeaking() {
  try {
    if (!isSynthesisSupported()) return false;
    return window.speechSynthesis.speaking;
  } catch (error) {
    console.warn('TTS: isSpeaking check failed:', error);
    return false;
  }
}

/**
 * Sets global TTS volume.
 * @param {number} volume Value between 0 and 1.
 * @returns {void}
 */
export function setTTSVolume(volume) {
  try {
    const numericVolume = Number(volume);
    ttsVolume = Math.max(0, Math.min(1, Number.isFinite(numericVolume) ? numericVolume : 1));
    console.log('TTS: Volume set to', ttsVolume);
  } catch (error) {
    console.warn('TTS: setTTSVolume failed:', error);
  }
}

/**
 * Enables/disables TTS globally.
 * @param {boolean} enabled
 * @returns {void}
 */
export function setTTSEnabled(enabled) {
  try {
    ttsEnabled = Boolean(enabled);
    if (!ttsEnabled) {
      cancelSpeech();
    }
    console.log('TTS:', ttsEnabled ? 'enabled' : 'disabled');
  } catch (error) {
    console.warn('TTS: setTTSEnabled failed:', error);
  }
}

/**
 * Returns the current TTS enabled state.
 * @returns {boolean}
 */
export function getTTSEnabled() {
  return ttsEnabled;
}

/**
 * Speaks text using browser speech synthesis.
 * @param {string} text
 * @returns {void}
 */
export function speak(text) {
  try {
    if (!ttsEnabled) return;
    if (!isSynthesisSupported()) {
      console.warn('TTS: speech synthesis not supported');
      return;
    }

    const cleanText = String(text ?? '').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = ttsVolume;

    console.log('TTS: Speaking sign phrase:', cleanText);
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn('TTS: speak failed:', error);
  }
}

/**
 * Speaks text with playback priority handling.
 * @param {string} text
 * @param {'high'|'normal'} priority
 * @returns {void}
 */
export function speakWithPriority(text, priority = 'normal') {
  try {
    if (!ttsEnabled) return;

    if (priority === 'high') {
      cancelSpeech();
      speak(text);
      return;
    }

    if (priority === 'normal') {
      if (!isSpeaking()) {
        speak(text);
      }
      return;
    }

    speak(text);
  } catch (error) {
    console.warn('TTS: speakWithPriority failed:', error);
  }
}

export const speakSign = (signName) => {
  const now = Date.now();

  if (
    signName === lastSpokenSign &&
    now - lastSpokenTime < SIGN_SPEAK_COOLDOWN
  ) {
    console.log('TTS: Skipping repeated sign:', signName);
    return;
  }

  const phrase = SIGN_PHRASES[signName];
  if (!phrase) return;

  lastSpokenSign = signName;
  lastSpokenTime = now;

  console.log('TTS: Speaking sign:', signName, phrase);
  return speak(phrase);
};
