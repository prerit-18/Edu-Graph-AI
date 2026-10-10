const express = require('express');
const router = express.Router();
const { normalizeEducationalTextForSpeech, splitTextIntoSpeechChunks } = require('../services/text_normalizer');
const { optionalAuth } = require('../middleware/authRequired');

/**
 * GET /api/tts/config
 * Returns the configured TTS provider, avatar details, and playback capabilities.
 */
router.get('/config', (req, res) => {
  const provider = (process.env.TTS_PROVIDER || 'browser').toLowerCase();
  res.json({
    provider,
    avatar: {
      name: 'Arya',
      title: 'GATE CSE AI Professor & Speaking Tutor',
      image: 'assets/tutor_avatar.jpg',
      animation: 'subtle_equalizer'
    },
    playback: {
      speedOptions: [0.75, 1.0, 1.25, 1.5],
      defaultSpeed: 1.0,
      supported: true
    }
  });
});

/**
 * POST /api/tts/normalize
 * Normalizes educational markdown, LaTeX math, formulas, and symbols for natural audio speech.
 */
router.post('/normalize', optionalAuth, (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text string is required' });
    }

    if (text.length > 10000) {
      return res.status(400).json({ error: 'Text exceeds maximum allowable length (10,000 characters)' });
    }

    const normalizedText = normalizeEducationalTextForSpeech(text);
    const chunks = splitTextIntoSpeechChunks(normalizedText);

    res.json({
      originalLength: text.length,
      normalizedLength: normalizedText.length,
      normalizedText,
      chunks,
      chunkCount: chunks.length
    });
  } catch (err) {
    res.status(500).json({ error: `Text normalization failed: ${err.message}` });
  }
});

/**
 * POST /api/tts/speak
 * Speech synthesis endpoint supporting browser-native delegation and optional server-backed providers.
 */
router.post('/speak', optionalAuth, async (req, res) => {
  try {
    const { text, speed = 1.0, voice = null } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text string is required' });
    }

    const provider = (process.env.TTS_PROVIDER || 'browser').toLowerCase();
    const normalizedText = normalizeEducationalTextForSpeech(text);
    const chunks = splitTextIntoSpeechChunks(normalizedText);

    // If server provider is configured (e.g. ElevenLabs), we can integrate subject to credentials
    if (provider === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
      try {
        const voiceId = process.env.TTS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel / default
        const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY
          },
          body: JSON.stringify({
            text: normalizedText.slice(0, 1500),
            model_id: 'eleven_monolingual_v1',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        });

        if (elevenRes.ok) {
          const audioBuffer = await elevenRes.arrayBuffer();
          res.set('Content-Type', 'audio/mpeg');
          return res.send(Buffer.from(audioBuffer));
        } else {
          console.warn(`ElevenLabs TTS failed (HTTP ${elevenRes.status}), falling back to browser synthesis`);
        }
      } catch (e) {
        console.warn('ElevenLabs API error, falling back to browser synthesis:', e.message);
      }
    }

    // Default: Return normalized text and chunk payload for high-performance Web Speech API synthesis
    res.json({
      provider: 'browser',
      normalizedText,
      chunks,
      speed: Number(speed) || 1.0,
      avatar: 'assets/tutor_avatar.jpg'
    });
  } catch (err) {
    res.status(500).json({ error: `Speech service error: ${err.message}` });
  }
});

module.exports = router;
