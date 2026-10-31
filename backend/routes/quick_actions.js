const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authRequired');
const conceptTeacher = require('../agents/concept_teacher');

/**
 * Quick Action Presets
 * Maps high-frequency student requests to token-optimized prompts and constrained token limits.
 */
const ACTIONS = {
  explain_concept: {
    feature: 'concept_explain',
    maxTokens: 2048,
    prompt: (topic) => `Explain ${topic} for GATE CSE: intuition, formulas, key invariants, exam traps.`
  },
  quick_revision: {
    feature: 'quick_doubt',
    maxTokens: 512,
    prompt: (topic) => `Give a 5-bullet quick revision summary of ${topic} for GATE CSE exam.`
  },
  give_example: {
    feature: 'quick_doubt',
    maxTokens: 512,
    prompt: (topic) => `Give one concrete worked example of ${topic} relevant to GATE CSE.`
  },
  exam_traps: {
    feature: 'quick_doubt',
    maxTokens: 512,
    prompt: (topic) => `List the top 3 GATE exam traps and common mistakes for ${topic}.`
  },
  solve_pyq: {
    feature: 'pyq_solution',
    maxTokens: 1024,
    prompt: (topic) => `Solve a representative GATE PYQ on ${topic} step by step.`
  }
};

/**
 * POST /api/quick-actions/:action
 * Body: { topic, topicId, subject }
 */
router.post('/:action', optionalAuth, async (req, res) => {
  try {
    const { action } = req.params;
    const actionConfig = ACTIONS[action];

    if (!actionConfig) {
      return res.status(400).json({
        error: `Unknown quick action: "${action}". Available: ${Object.keys(ACTIONS).join(', ')}`
      });
    }

    const { topic = 'CPU Scheduling', topicId, subject } = req.body;
    const query = actionConfig.prompt(topic);

    const result = await conceptTeacher.run({
      query,
      topicId,
      subject,
      userId: req.user?.id,
      maxOutputTokens: actionConfig.maxTokens,
      featureLabel: actionConfig.feature
    });

    res.json({
      agent: result.agent,
      explanation: result.explanation,
      citations: result.citations || [],
      action,
      feature: actionConfig.feature
    });
  } catch (err) {
    console.error(`Quick action [${req.params.action}] error:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
