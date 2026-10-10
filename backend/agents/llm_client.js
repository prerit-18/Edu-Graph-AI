require('dotenv').config();

/**
 * Provider-Independent Multi-LLM Client
 * Connects to Gemini, Groq, OpenAI, or OpenRouter with zero external SDK overhead.
 */
class LLMClient {
  constructor() {
    this.reloadConfig();
  }

  reloadConfig() {
    this.provider = (process.env.LLM_PROVIDER || '').toLowerCase();
    this.model = process.env.LLM_MODEL;
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.groqKey = process.env.GROQ_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.openrouterKey = process.env.OPENROUTER_API_KEY;

    // Auto-detect provider based on available valid keys if provider not specified or invalid
    if (!this.provider || this.provider === 'openrouter' && (!this.openrouterKey || this.openrouterKey === 'your_key')) {
      if (this.geminiKey && this.geminiKey !== 'your_key') {
        this.provider = 'gemini';
      } else if (this.groqKey && this.groqKey !== 'your_key') {
        this.provider = 'groq';
      } else if (this.openaiKey && this.openaiKey !== 'your_key') {
        this.provider = 'openai';
      } else if (this.openrouterKey && this.openrouterKey !== 'your_key') {
        this.provider = 'openrouter';
      }
    }
  }

  hasValidKey() {
    this.reloadConfig();
    if (this.provider === 'gemini' && this.geminiKey && this.geminiKey !== 'your_key') return true;
    if (this.provider === 'groq' && this.groqKey && this.groqKey !== 'your_key') return true;
    if (this.provider === 'openai' && this.openaiKey && this.openaiKey !== 'your_key') return true;
    if (this.provider === 'openrouter' && this.openrouterKey && this.openrouterKey !== 'your_key') return true;
    return false;
  }

  async generate({ systemPrompt, userPrompt, temperature = 0.3, jsonMode = false, responseSchema = null }) {
    if (!this.hasValidKey()) {
      return null; // Signals fallback to local domain grounding engine
    }

    try {
      // 1. Google Gemini API
      if (this.provider === 'gemini') {
        const geminiModel = this.model ? this.model.replace(/^gemini\//i, '') : 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${this.geminiKey}`;

        const genConfig = {
          temperature,
          maxOutputTokens: 8192
        };
        if (jsonMode || responseSchema) {
          genConfig.responseMimeType = 'application/json';
        }
        if (responseSchema) {
          genConfig.responseSchema = responseSchema;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
              }
            ],
            generationConfig: genConfig
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`Gemini API error (HTTP ${res.status}): ${errText}`);
          return null;
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }

      // 2. Groq API (High-speed Llama 3)
      if (this.provider === 'groq') {
        const groqModel = this.model && !this.model.includes('/') ? this.model : 'llama-3.3-70b-versatile';
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature
          })
        });

        if (!res.ok) {
          console.warn(`Groq API error: HTTP ${res.status}`);
          return null;
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
      }

      // 3. OpenAI API
      if (this.provider === 'openai') {
        const openaiModel = this.model && !this.model.includes('/') ? this.model : 'gpt-4o-mini';
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: openaiModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature
          })
        });

        if (!res.ok) {
          console.warn(`OpenAI API error: HTTP ${res.status}`);
          return null;
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
      }

      // 4. OpenRouter API
      if (this.provider === 'openrouter') {
        const orModel = this.model || 'meta-llama/llama-3.3-70b-instruct:free';
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://edugraph-ai.local',
            'X-Title': 'EduGraph AI'
          },
          body: JSON.stringify({
            model: orModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature
          })
        });

        if (!response.ok) {
          console.warn(`OpenRouter API error: HTTP ${response.status}`);
          return null;
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
      }
    } catch (err) {
      console.warn('External LLM call failed:', err.message);
      return null;
    }

    return null;
  }
}

module.exports = new LLMClient();
