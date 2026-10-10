/**
 * EduGraph AI — Speaking Tutor System
 * Voice synthesis, educational text normalization, audio lifecycle management,
 * and realistic avatar state visualization for Study Studio and Active Recall.
 */

// 1. Client-Side Educational Text Normalizer
const EducationalTextNormalizer = {
  normalize(text) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // 1. Remove code blocks (replace with speech cue)
    cleaned = cleaned.replace(/```[a-z]*[\s\S]*?```/gi, ' Refer to the code implementation shown on screen. ');

    // 2. Remove Markdown tables (replace with brief spoken note)
    cleaned = cleaned.replace(/\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n?)+/gi, ' Refer to the summary table on screen. ');

    // 3. Remove inline backticks while keeping code text
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // 4. Remove images & HTML
    cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');

    // 5. Clean headers: '### 📘 Operating Systems ➔ CONCEPT' -> 'Operating Systems: CONCEPT.'
    cleaned = cleaned.replace(/^#+\s*[^\w\s]*\s*(.+)$/gm, (match, title) => {
      const formatted = title.replace(/[➔→]/g, ': ').replace(/[📘⚡🎯🧠📊🔍⚠️💡]/g, '').replace(/\s+/g, ' ').trim();
      return formatted.endsWith('.') ? formatted : formatted + '.';
    });

    // 6. Clean blockquotes & pro-tips
    cleaned = cleaned.replace(/^>\s*[⚠️💡]*\s*\*\*([^*]+)\*\*:?/gm, '$1:');
    cleaned = cleaned.replace(/^>\s*/gm, '');

    // 7. Strip citation brackets like [Source: ...] or [1]
    cleaned = cleaned.replace(/\[Source:[^\]]+\]/gi, '');
    cleaned = cleaned.replace(/\[[0-9]+\]/g, '');

    // 8. Convert explicit LaTeX math and formulas ($ ... $) FIRST so math symbols like * are preserved
    cleaned = cleaned.replace(/\$([^$]+)\$/g, (m, f) => this.normalizeFormula(f));

    // 9. Strip Markdown bold, italics, bullets, and decorators from prose (prevents asterisks becoming "times times")
    cleaned = cleaned.replace(/\*\*\*([^*]+)\*\*\*/g, '$1'); // bold italic
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');     // bold
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');         // italic
    cleaned = cleaned.replace(/___([^_]+)___/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
    cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');
    cleaned = cleaned.replace(/^[\*\-\+]\s+/gm, ' ');         // bullet points
    cleaned = cleaned.replace(/[*_~]{1,3}/g, '');            // any leftover stray asterisks/underscores
    cleaned = cleaned.replace(/---+/g, ' ');

    // 10. Also catch unescaped standalone CS and math expressions
    cleaned = this.normalizeFormula(cleaned);

    // 11. Clean extra whitespaces and punctuation
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/\.{2,}/g, '.');
    cleaned = cleaned.replace(/\s+([.,;:?!])/g, '$1');

    return cleaned.trim();
  },

  normalizeFormula(formula) {
    let f = formula;
    f = f.replace(/\bTAT\s*=\s*CT\s*-\s*AT\b/gi, 'Turnaround Time equals Completion Time minus Arrival Time');
    f = f.replace(/\bWT\s*=\s*TAT\s*-\s*BT\b/gi, 'Waiting Time equals Turnaround Time minus Burst Time');
    f = f.replace(/\bWT\s*=\s*\(CT\s*-\s*AT\)\s*-\s*BT\b/gi, 'Waiting Time equals Completion Time minus Arrival Time minus Burst Time');
    f = f.replace(/\bBDP\s*=\s*Bandwidth\s*\*\s*Delay\b/gi, 'Bandwidth Delay Product equals Bandwidth times Propagation Delay');

    f = f.replace(/T\(n\)\s*=\s*a\s*\*\s*T\(n\/b\)\s*\+\s*f\(n\)/gi, 'T of n equals a times T of n over b plus f of n');
    f = f.replace(/n\^\{\\log_b\s*a\}/gi, 'n to the power of log base b of a');
    f = f.replace(/n\^\(log_b\s*a\)/gi, 'n to the power of log base b of a');
    f = f.replace(/\\log_2/gi, 'log base 2');
    f = f.replace(/\\log_b/gi, 'log base b');
    f = f.replace(/\blog_2\b/gi, 'log base 2');

    f = f.replace(/\\Theta\s*\(([^)]+)\)/gi, 'Theta of $1');
    f = f.replace(/Theta\s*\(([^)]+)\)/gi, 'Theta of $1');
    f = f.replace(/\\Omega\s*\(([^)]+)\)/gi, 'Big Omega of $1');
    f = f.replace(/Omega\s*\(([^)]+)\)/gi, 'Big Omega of $1');
    f = f.replace(/O\s*\(([^)]+)\)/g, 'Big O of $1');

    f = f.replace(/n\s*\\log\s*n/gi, 'n log n');
    f = f.replace(/n\s*log\s*n/gi, 'n log n');
    f = f.replace(/n\^2/g, 'n squared');
    f = f.replace(/n\^3/g, 'n cubed');
    f = f.replace(/n\^k/g, 'n to the power of k');
    f = f.replace(/2\^n/g, 'two to the power of n');
    f = f.replace(/n!/g, 'n factorial');

    f = f.replace(/\|V\|\s*=\s*/gi, 'number of vertices equals ');
    f = f.replace(/\|E\|\s*=\s*/gi, 'number of edges equals ');
    f = f.replace(/\|V\|/gi, 'number of vertices');
    f = f.replace(/\|E\|/gi, 'number of edges');

    f = f.replace(/\\le|\\leq|<=/g, ' is less than or equal to ');
    f = f.replace(/\\ge|\\geq|>=/g, ' is greater than or equal to ');
    f = f.replace(/\\neq|!=/g, ' is not equal to ');
    f = f.replace(/\\approx|~=/g, ' is approximately ');
    f = f.replace(/\\in/g, ' in ');
    f = f.replace(/\\notin/g, ' not in ');
    f = f.replace(/\\subset/g, ' subset of ');
    f = f.replace(/\\cup/g, ' union ');
    f = f.replace(/\\cap/g, ' intersection ');
    f = f.replace(/\\infty/g, 'infinity');
    f = f.replace(/\\times|\\cdot/g, ' times ');
    f = f.replace(/([0-9a-zA-Z\)])\s*\*\s*([0-9a-zA-Z\(])/g, '$1 times $2');
    f = f.replace(/\*/g, '');
    f = f.replace(/\\rightarrow|->/g, ' implies ');
    f = f.replace(/\\leftarrow|<-/g, ' assigned from ');
    f = f.replace(/\\epsilon/g, 'epsilon');
    return f;
  },

  splitIntoChunks(text, maxChunkLen = 175) {
    if (!text) return [];
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
    const chunks = [];
    let currentChunk = '';

    for (const raw of sentences) {
      const s = raw.trim();
      if (!s) continue;

      if (currentChunk.length + s.length + 1 <= maxChunkLen) {
        currentChunk += (currentChunk ? ' ' : '') + s;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        if (s.length > maxChunkLen) {
          const clauses = s.split(/([,;:]\s+)/);
          let clauseBuf = '';
          for (const cl of clauses) {
            if (clauseBuf.length + cl.length <= maxChunkLen) {
              clauseBuf += cl;
            } else {
              if (clauseBuf) chunks.push(clauseBuf.trim());
              clauseBuf = cl;
            }
          }
          currentChunk = clauseBuf.trim();
        } else {
          currentChunk = s;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
};

// 2. Tutor Speech Service Engine
class TutorSpeechService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.state = 'idle'; // idle | loading | speaking | paused | error
    this.speed = 1.0;
    this.currentChunks = [];
    this.currentChunkIndex = 0;
    this.currentText = '';
    this.activeUtterance = null;
    this.availableVoices = [];
    this.selectedVoice = null;
    this.listeners = new Set();
    this.keepAliveTimer = null;

    if (this.synth) {
      this.initVoices();
      if (typeof window !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
        // Clean up on page unload or navigation
        window.addEventListener('beforeunload', () => this.stop());
      }
    }
  }

  isSupported() {
    return !!(this.synth && typeof SpeechSynthesisUtterance !== 'undefined');
  }

  initVoices() {
    if (!this.synth) return;
    this.availableVoices = this.synth.getVoices() || [];
    if (this.availableVoices.length === 0) return;

    const enVoices = this.availableVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
    const pool = enVoices.length > 0 ? enVoices : this.availableVoices;

    // High priority list of female voices across OS and browsers (Samantha, Jenny, Aria, Zira, Karen, Siri, Google US English, etc.)
    const femaleKeywords = [
      'samantha', 'jenny', 'aria', 'zira', 'karen', 'veena', 'victoria',
      'fiona', 'moira', 'tessa', 'serena', 'sonia', 'libby', 'hazel', 'susan',
      'google us english', 'google uk english female', 'female', 'woman',
      'natural (female)', 'neural2-f', 'wavenet-c', 'wavenet-e', 'siri'
    ];

    const maleKeywords = [
      'daniel', 'david', 'alex', 'fred', 'guy', 'george', 'oliver',
      'tom', 'rishi', 'mark', 'james', 'ryan', 'richard', 'brian', 'male'
    ];

    // 1. First priority: English female voice
    let best = pool.find(v => {
      const name = (v.name || '').toLowerCase();
      const isFemale = femaleKeywords.some(kw => name.includes(kw));
      const isMale = maleKeywords.some(kw => name.includes(kw));
      return isFemale && !isMale;
    });

    // 2. Second priority: Any voice that is not identified as male
    if (!best) {
      best = pool.find(v => {
        const name = (v.name || '').toLowerCase();
        return !maleKeywords.some(kw => name.includes(kw));
      });
    }

    this.selectedVoice = best || pool[0];
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyState() {
    const payload = {
      state: this.state,
      speed: this.speed,
      chunkIndex: this.currentChunkIndex,
      totalChunks: this.currentChunks.length,
      currentChunkText: this.currentChunks[this.currentChunkIndex] || '',
      progressPct: this.currentChunks.length > 0 ? Math.round(((this.currentChunkIndex + 1) / this.currentChunks.length) * 100) : 0
    };
    for (const listener of this.listeners) {
      try { listener(payload); } catch (e) { console.error('Tutor listener error:', e); }
    }
  }

  setState(newState) {
    this.state = newState;
    this.notifyState();
  }

  setSpeed(speed) {
    this.speed = Number(speed) || 1.0;
    this.notifyState();
  }

  speak(rawText, options = {}) {
    if (!this.isSupported()) {
      this.setState('error');
      return false;
    }

    // Stop any existing speech session
    this.stop(false);

    if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
      this.setState('idle');
      return false;
    }

    this.currentText = rawText;
    const normalized = EducationalTextNormalizer.normalize(rawText);
    this.currentChunks = EducationalTextNormalizer.splitIntoChunks(normalized);
    this.currentChunkIndex = 0;

    if (this.currentChunks.length === 0) {
      this.setState('idle');
      return false;
    }

    if (options.speed) {
      this.speed = Number(options.speed) || 1.0;
    }

    this.setState('speaking');
    this.playChunk(0);
    return true;
  }

  playChunk(index) {
    if (!this.synth || this.state === 'idle' || this.state === 'paused') return;

    if (index >= this.currentChunks.length) {
      this.stop();
      return;
    }

    this.currentChunkIndex = index;
    const chunkText = this.currentChunks[index];
    this.notifyState();

    const utterance = new SpeechSynthesisUtterance(chunkText);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = this.speed;
    utterance.pitch = 1.02; // Warm, natural educational tone
    utterance.volume = 1.0;

    utterance.onend = () => {
      this.clearIntervalKeepAlive();
      if (this.state === 'speaking') {
        this.playChunk(index + 1);
      }
    };

    utterance.onerror = (err) => {
      this.clearIntervalKeepAlive();
      if (err.error !== 'canceled' && err.error !== 'interrupted') {
        console.warn('Speech synthesis utterance error:', err);
        this.setState('error');
      }
    };

    this.activeUtterance = utterance;

    // Chromium keepalive bug prevention: resume periodically if paused unexpectedly
    this.startIntervalKeepAlive();

    this.synth.speak(utterance);
  }

  startIntervalKeepAlive() {
    this.clearIntervalKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.synth && this.synth.speaking && !this.synth.paused) {
        this.synth.pause();
        this.synth.resume();
      }
    }, 10000);
  }

  clearIntervalKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  pause() {
    if (this.synth && this.state === 'speaking') {
      this.clearIntervalKeepAlive();
      this.synth.pause();
      this.setState('paused');
    }
  }

  resume() {
    if (this.synth && this.state === 'paused') {
      this.synth.resume();
      this.setState('speaking');
      this.startIntervalKeepAlive();
    }
  }

  stop(notify = true) {
    this.clearIntervalKeepAlive();
    if (this.synth) {
      this.synth.cancel();
    }
    this.activeUtterance = null;
    this.currentChunks = [];
    this.currentChunkIndex = 0;
    if (notify) {
      this.setState('idle');
    }
  }

  replay() {
    if (this.currentText) {
      this.speak(this.currentText, { speed: this.speed });
    }
  }
}

// Global Singleton Speech Service
const tutorSpeechService = new TutorSpeechService();

// 3. Tutor Avatar & Audio Controls Component Generator
function createTutorAvatarWidget(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const tutorName = options.tutorName || 'Arya';
  const tutorRole = options.tutorRole || 'GATE CSE AI Speaking Tutor';
  const avatarImg = options.avatarImg || 'assets/tutor_avatar.jpg';

  container.innerHTML = `
    <div class="tutor-widget-card" id="${containerId}-card" role="region" aria-label="AI Speaking Tutor Player">
      <div class="tutor-widget-header">
        <div class="tutor-avatar-container">
          <div class="tutor-avatar-ring" id="${containerId}-ring">
            <img src="${avatarImg}" alt="${tutorName}" class="tutor-avatar-img" id="${containerId}-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'64\\' height=\\'64\\' viewBox=\\'0 0 24 24\\' fill=\\'%23245B45\\'><circle cx=\\'12\\' cy=\\'8\\' r=\\'4\\'/><path d=\\'M4 20c0-4 4-6 8-6s8 2 8 6\\'/></svg>'">
            <!-- Animated Soundwaves overlay -->
            <div class="tutor-soundwaves" id="${containerId}-soundwaves" aria-hidden="true">
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
            </div>
          </div>
        </div>

        <div class="tutor-info">
          <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.15rem;">
            <h4 class="tutor-name">${tutorName}</h4>
          </div>
          <div class="tutor-title">${tutorRole}</div>
          <div class="tutor-status-text" id="${containerId}-status">Ready to speak explanation</div>
        </div>
      </div>

      <!-- Playback Controls -->
      <div class="tutor-controls-bar">
        <div class="tutor-btn-group">
          <!-- Main Action Button (Listen / Pause / Resume) -->
          <button class="btn btn-primary btn-sm tutor-action-btn" id="${containerId}-btn-play" aria-label="Listen to explanation" onclick="handleTutorPlayClick('${containerId}')">
            <span class="tutor-btn-icon" id="${containerId}-play-icon">▶</span>
            <span id="${containerId}-play-label">Listen</span>
          </button>

          <!-- Stop Button -->
          <button class="btn btn-secondary btn-sm tutor-icon-btn" id="${containerId}-btn-stop" aria-label="Stop audio" title="Stop" onclick="handleTutorStopClick('${containerId}')" disabled>
            ■
          </button>

          <!-- Replay Button -->
          <button class="btn btn-secondary btn-sm tutor-icon-btn" id="${containerId}-btn-replay" aria-label="Replay from start" title="Replay" onclick="handleTutorReplayClick('${containerId}')" disabled>
            ↺
          </button>
        </div>

        <!-- Speed Selector -->
        <div class="tutor-speed-group">
          <label for="${containerId}-speed" class="tutor-speed-label">Speed:</label>
          <select id="${containerId}-speed" class="tutor-speed-select" aria-label="Playback speed" onchange="handleTutorSpeedChange('${containerId}', this.value)">
            <option value="0.75">0.75×</option>
            <option value="1.0" selected>1.0×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
          </select>
        </div>
      </div>

      <!-- Audio Progress Bar & Live Caption Snippet -->
      <div class="tutor-progress-container" id="${containerId}-progress-box" style="display: none;">
        <div class="tutor-progress-bar">
          <div class="tutor-progress-fill" id="${containerId}-progress-fill" style="width: 0%;"></div>
        </div>
        <div class="tutor-caption" id="${containerId}-caption"></div>
      </div>
    </div>
  `;

  // Attach state listener to update this widget
  tutorSpeechService.addListener((state) => {
    updateTutorWidgetUI(containerId, state);
  });

  return {
    speak: (text) => tutorSpeechService.speak(text),
    stop: () => tutorSpeechService.stop(),
    pause: () => tutorSpeechService.pause(),
    resume: () => tutorSpeechService.resume()
  };
}

function updateTutorWidgetUI(containerId, data) {
  const card = document.getElementById(`${containerId}-card`);
  const ring = document.getElementById(`${containerId}-ring`);
  const statusEl = document.getElementById(`${containerId}-status`);
  const playBtn = document.getElementById(`${containerId}-btn-play`);
  const playIcon = document.getElementById(`${containerId}-play-icon`);
  const playLabel = document.getElementById(`${containerId}-play-label`);
  const stopBtn = document.getElementById(`${containerId}-btn-stop`);
  const replayBtn = document.getElementById(`${containerId}-btn-replay`);
  const progressBox = document.getElementById(`${containerId}-progress-box`);
  const progressFill = document.getElementById(`${containerId}-progress-fill`);
  const captionEl = document.getElementById(`${containerId}-caption`);

  if (!card || !ring || !statusEl || !playBtn) return;

  if (data.state === 'speaking') {
    card.classList.add('is-speaking');
    card.classList.remove('is-paused', 'is-error');
    ring.classList.add('active-speaking');
    statusEl.textContent = `Speaking explanation (${data.chunkIndex + 1}/${data.totalChunks})...`;
    statusEl.style.color = 'var(--accent-primary)';

    playIcon.textContent = '⏸';
    playLabel.textContent = 'Pause';
    stopBtn.disabled = false;
    replayBtn.disabled = false;

    if (progressBox) progressBox.style.display = 'block';
    if (progressFill) progressFill.style.width = `${data.progressPct}%`;
    if (captionEl) captionEl.textContent = `"${data.currentChunkText}"`;
  } else if (data.state === 'paused') {
    card.classList.add('is-paused');
    card.classList.remove('is-speaking', 'is-error');
    ring.classList.remove('active-speaking');
    statusEl.textContent = 'Audio paused';
    statusEl.style.color = 'var(--accent-amber)';

    playIcon.textContent = '▶';
    playLabel.textContent = 'Resume';
    stopBtn.disabled = false;
    replayBtn.disabled = false;
  } else if (data.state === 'error') {
    card.classList.add('is-error');
    card.classList.remove('is-speaking', 'is-paused');
    ring.classList.remove('active-speaking');
    statusEl.textContent = 'Voice audio unavailable. Text remains accessible.';
    statusEl.style.color = 'var(--accent-rose)';

    playIcon.textContent = '▶';
    playLabel.textContent = 'Listen';
    stopBtn.disabled = true;
    replayBtn.disabled = true;
    if (progressBox) progressBox.style.display = 'none';
  } else {
    // Idle
    card.classList.remove('is-speaking', 'is-paused', 'is-error');
    ring.classList.remove('active-speaking');
    statusEl.textContent = 'Ready to speak';
    statusEl.style.color = 'var(--text-muted)';

    playIcon.textContent = '▶';
    playLabel.textContent = 'Listen';
    stopBtn.disabled = true;
    replayBtn.disabled = !tutorSpeechService.currentText;
    if (progressBox) progressBox.style.display = 'none';
  }
}

// Widget event handlers
function handleTutorPlayClick(containerId) {
  if (tutorSpeechService.state === 'speaking') {
    tutorSpeechService.pause();
  } else if (tutorSpeechService.state === 'paused') {
    tutorSpeechService.resume();
  } else {
    // If widget container has a data-speech-text attribute, speak it
    const container = document.getElementById(containerId);
    const text = container ? container.getAttribute('data-speech-text') : null;
    if (text) {
      const speedSelect = document.getElementById(`${containerId}-speed`);
      const speed = speedSelect ? Number(speedSelect.value) : 1.0;
      tutorSpeechService.speak(text, { speed });
    }
  }
}

function handleTutorStopClick(containerId) {
  tutorSpeechService.stop();
}

function handleTutorReplayClick(containerId) {
  tutorSpeechService.replay();
}

function handleTutorSpeedChange(containerId, speed) {
  tutorSpeechService.setSpeed(Number(speed) || 1.0);
}

// Export modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EducationalTextNormalizer,
    TutorSpeechService,
    tutorSpeechService
  };
}
