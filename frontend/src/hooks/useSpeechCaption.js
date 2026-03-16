import { useState, useRef, useEffect, useCallback } from 'react';

export function useSpeechCaption(sendMessage, userId, userName, isSignModeOn) {
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const restartTimerRef = useRef(null);
  const sessionActiveRef = useRef(false);

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [lastFinalText, setLastFinalText] = useState('');

  const checkBrowserSupport = useCallback(() => {
    const supported =
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    setIsSupported(supported);
    return supported;
  }, []);

  const requestMicPermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        setPermissionDenied(true);
        console.warn('Microphone permission denied');
      }
      return false;
    }
  }, []);

  const createRecognition = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      console.log('SpeechCaption: Recognition started');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (interimTranscript) {
        setInterimText(interimTranscript);
        sendMessage('speech-text', {
          text: interimTranscript,
          is_final: false,
          user_id: userId,
          user_name: userName,
          timestamp: Date.now(),
        });
      }

      if (finalTranscript) {
        const cleanText = finalTranscript.trim();
        setLastFinalText(cleanText);
        setInterimText('');
        sendMessage('speech-text', {
          text: cleanText,
          is_final: true,
          user_id: userId,
          user_name: userName,
          timestamp: Date.now(),
        });
        console.log('SpeechCaption: Final text:', cleanText);
      }
    };

    recognition.onerror = (event) => {
      console.warn('SpeechCaption: Error:', event.error);

      if (event.error === 'not-allowed') {
        setPermissionDenied(true);
        sessionActiveRef.current = false;
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }

      if (event.error === 'no-speech') {
        console.log('SpeechCaption: No speech detected, continuing...');
        return;
      }

      if (event.error === 'network') {
        console.warn('SpeechCaption: Network error, will retry');
      }
    };

    recognition.onend = () => {
      console.log('SpeechCaption: Recognition ended');
      isListeningRef.current = false;
      setIsListening(false);
      setInterimText('');

      if (sessionActiveRef.current && !permissionDenied) {
        restartTimerRef.current = setTimeout(() => {
          if (sessionActiveRef.current) {
            try {
              recognition.start();
            } catch (error) {
              console.warn('SpeechCaption: Restart failed:', error);
            }
          }
        }, 500);
      }
    };

    return recognition;
  }, [permissionDenied, sendMessage, userId, userName]);

  const startListening = useCallback(async () => {
    if (!isSupported) {
      console.warn('SpeechCaption: Not supported');
      return;
    }

    const hasPermission = await requestMicPermission();
    if (!hasPermission) return;

    if (!recognitionRef.current) {
      recognitionRef.current = createRecognition();
    }

    if (!recognitionRef.current) return;

    sessionActiveRef.current = true;
    setPermissionDenied(false);

    try {
      recognitionRef.current.start();
    } catch (error) {
      if (error?.message?.toLowerCase().includes('already started')) {
        console.log('SpeechCaption: Already running');
      } else {
        console.error('SpeechCaption: Start failed:', error);
      }
    }
  }, [isSupported, requestMicPermission, createRecognition]);

  const stopListening = useCallback(() => {
    sessionActiveRef.current = false;
    isListeningRef.current = false;

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.warn('SpeechCaption: Stop error:', error);
      }
    }

    setIsListening(false);
    setInterimText('');
    console.log('SpeechCaption: Stopped');
  }, []);

  useEffect(() => {
    checkBrowserSupport();
  }, [checkBrowserSupport]);

  useEffect(() => {
    if (isSignModeOn) {
      stopListening();
    }
    console.log('SpeechCaption: Sign mode changed:', isSignModeOn ? 'ON' : 'OFF');
  }, [isSignModeOn, stopListening]);

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore cleanup stop errors
        }
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    permissionDenied,
    interimText,
    lastFinalText,
    startListening,
    stopListening,
  };
}
