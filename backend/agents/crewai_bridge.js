const { execFile } = require('child_process');
const path = require('path');

const RUNNER_SCRIPT = path.resolve(__dirname, '../crewai/crew_runner.py');
const PYTHON_CANDIDATES = [
  process.env.PYTHON_BIN,
  '/opt/anaconda3/bin/python3',
  '/opt/anaconda3/bin/python',
  'python3',
  'python'
].filter(Boolean);

/**
 * Executes a task using the official Python CrewAI engine
 * @param {Object} options - { task, query, subject, topicId, questionId, studentAnswer, userId }
 */
function runCrewAITask({ task, query = '', subject, topicId, questionId, studentAnswer, userId }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ subject, topicId, questionId, studentAnswer, userId, query });
    const args = [
      RUNNER_SCRIPT,
      '--task', task,
      '--query', query || '',
      '--data', payload
    ];

    // Try candidate Python binaries
    let tried = 0;
    function tryNext() {
      if (tried >= PYTHON_CANDIDATES.length) {
        return reject(new Error('No working Python binary found for CrewAI execution'));
      }

      const pythonBin = PYTHON_CANDIDATES[tried++];
      execFile(pythonBin, args, { maxBuffer: 10 * 1024 * 1024, timeout: 45000 }, (err, stdout, stderr) => {
        if (err) {
          // If binary not found, try next
          if (err.code === 'ENOENT') {
            return tryNext();
          }
          console.warn(`[CrewAI Bridge Warning] (${pythonBin}):`, stderr || err.message);
          return reject(err);
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (parseErr) {
          console.warn('[CrewAI Bridge Parse Warning] Raw output:', stdout);
          reject(new Error(`Failed to parse CrewAI response: ${parseErr.message}`));
        }
      });
    }

    tryNext();
  });
}

module.exports = {
  runCrewAITask
};
