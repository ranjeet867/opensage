window.IA_AUDIO = (() => {
  function createAudioController({ onTranscript, onStateChange, minChars = 4, silenceMs = 1300 }) {
    let recognition = null;
    let running = false;
    let finalText = '';
    let silenceTimer = null;

    function start() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) throw new Error('SpeechRecognition not available');
      if (running) return;

      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        running = true;
        finalText = '';
        onStateChange?.('listening');
      };

      recognition.onresult = (event) => {
        let finalChunk = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalChunk += ` ${event.results[i][0].transcript}`;
          else interim += ` ${event.results[i][0].transcript}`;
        }
        if (finalChunk) finalText += finalChunk;
        const current = `${finalText} ${interim}`.trim();
        onTranscript?.(current, false);

        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          const spoken = `${finalText} ${interim}`.trim();
          if (spoken.length >= minChars) {
            onTranscript?.(spoken, true);
            finalText = '';
          }
        }, silenceMs);
      };

      recognition.onerror = (event) => {
        onStateChange?.(`error:${event.error}`);
        stop();
      };

      recognition.onend = () => {
        if (running) {
          try { recognition.start(); } catch {}
        }
      };

      recognition.start();
    }

    function stop() {
      running = false;
      clearTimeout(silenceTimer);
      if (recognition) recognition.stop();
      recognition = null;
      onStateChange?.('stopped');
    }

    function isRunning() {
      return running;
    }

    return { start, stop, isRunning };
  }

  return { createAudioController };
})();
