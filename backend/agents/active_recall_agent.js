const ragTool = require('../tools/rag_tool');
const pyqTool = require('../tools/pyq_tool');
const bktTool = require('../tools/bkt_tool');
const learnerStateTool = require('../tools/learner_state_tool');
const llmClient = require('./llm_client');
const db = require('../database/db');
const crypto = require('crypto');

/**
 * Active Recall Agent
 * Role: Conceptual Retrieval & Socratic Grader
 * Goal: Formulate free recall, cloze, and short-answer probes, evaluate student recall, and update BKT.
 * Tools: learner_state_tool, rag_tool, bkt_tool
 */
class ActiveRecallAgent {
  constructor() {
    this.role = 'Active Recall Agent';
    this.goal = 'Challenge learner memory with open-ended and cloze recall prompts, evaluate understanding, and update BKT.';
    this.backstory = 'Cognitive retrieval specialist who trains students to actively pull knowledge from memory rather than passively recognizing options.';
    this.tools = [learnerStateTool, ragTool, bktTool];
  }

  /**
   * Generate an active recall challenge
   */
  async generatePrompt({ topicId, userId, type = 'short_answer' }) {
    let targetTopicId = topicId;

    // If topicId not specified, automatically pick the weakest topic for this user!
    if (!targetTopicId && userId) {
      const weakTopics = learnerStateTool.getWeakTopics(userId);
      if (weakTopics.length > 0) {
        targetTopicId = weakTopics[0].topic_id;
      }
    }

    if (!targetTopicId) {
      targetTopicId = 'os_scheduling';
    }

    const topicRow = db.prepare('SELECT * FROM topics WHERE id = ?').get(targetTopicId);
    const topicName = topicRow ? topicRow.name : targetTopicId;
    const subject = topicRow ? topicRow.subject : 'Operating Systems';

    // Retrieve context from RAG
    const ragContext = ragTool.execute({
      query: `${topicName} definitions, principles, formulas, and conditions`,
      filters: { topic_id: targetTopicId, topK: 2 }
    });

    const contextText = ragContext.results.map(r => r.text).join('\n');

    // Prompt templates by topic
    const promptsRepo = {
      os_scheduling: [
        {
          type: 'short_answer',
          prompt: 'In your own words, state the primary disadvantage of Non-Preemptive Shortest Job First (SJF) scheduling and name the scheduling algorithm that prevents this by dynamically adjusting priorities.',
          referenceAnswer: 'SJF causes starvation (convoy/indefinite waiting) for longer processes when shorter jobs arrive continuously. Aging (or Priority scheduling with Aging / Round Robin) prevents starvation.',
          keyConcepts: ['starvation', 'aging', 'burst time', 'indefinite waiting']
        },
        {
          type: 'cloze',
          prompt: 'Fill in the blanks: In Round Robin scheduling, if the time quantum is extremely large, the algorithm behaves like ______; whereas if the time quantum is extremely small, it approximates ______ with high context switching overhead.',
          referenceAnswer: 'FCFS (First-Come First-Served), Processor Sharing (or Round Robin / multitasking)',
          keyConcepts: ['fcfs', 'processor sharing', 'first come first served']
        }
      ],
      os_sync: [
        {
          type: 'free_recall',
          prompt: 'State the three mandatory conditions required for any valid software or hardware solution to the Critical Section problem, and briefly define Bounded Waiting.',
          referenceAnswer: '1. Mutual Exclusion, 2. Progress, 3. Bounded Waiting. Bounded waiting ensures there is a limit on the number of times other processes can enter their critical sections after a process has made a request.',
          keyConcepts: ['mutual exclusion', 'progress', 'bounded waiting', 'limit']
        }
      ],
      os_deadlock: [
        {
          type: 'short_answer',
          prompt: 'List the four Coffman conditions necessary for a deadlock to occur in an operating system. Which condition is eliminated when resources are preempted?',
          referenceAnswer: '1. Mutual Exclusion, 2. Hold and Wait, 3. No Preemption, 4. Circular Wait. Preempting resources directly eliminates the "No Preemption" condition.',
          keyConcepts: ['mutual exclusion', 'hold and wait', 'no preemption', 'circular wait']
        }
      ],
      algo_asymptotic: [
        {
          type: 'short_answer',
          prompt: 'State the Master Theorem condition for T(n) = a*T(n/b) + f(n) when f(n) = Theta(n^(log_b a)). What is the resulting time complexity?',
          referenceAnswer: 'When f(n) = Theta(n^(log_b a)), Case 2 of Master Theorem applies, resulting in T(n) = Theta(n^(log_b a) * log n).',
          keyConcepts: ['case 2', 'log n', 'theta']
        }
      ],
      dbms_normalization: [
        {
          type: 'short_answer',
          prompt: 'Define Boyce-Codd Normal Form (BCNF). For every non-trivial functional dependency X -> Y, what must hold true for X?',
          referenceAnswer: 'In BCNF, for every non-trivial functional dependency X -> Y, the determinant X must be a superkey (or candidate key) of the relation.',
          keyConcepts: ['superkey', 'super key', 'candidate key', 'determinant']
        }
      ]
    };

    const topicPrompts = promptsRepo[targetTopicId] || [
      {
        type: 'short_answer',
        prompt: `Explain the fundamental concept of ${topicName} and state one major trade-off or pitfall tested in GATE CSE.`,
        referenceAnswer: `Core concept involves ${topicRow?.name}. Important considerations include boundary conditions and time/space complexity tradeoffs.`,
        keyConcepts: [topicRow?.name?.toLowerCase() || 'concept']
      }
    ];

    const selectedPrompt = topicPrompts[Math.floor(Math.random() * topicPrompts.length)];

    return {
      agent: this.role,
      promptId: crypto.randomUUID(),
      topicId: targetTopicId,
      topicName,
      subject,
      promptType: selectedPrompt.type,
      question: selectedPrompt.prompt,
      referenceAnswer: selectedPrompt.referenceAnswer,
      keyConcepts: selectedPrompt.keyConcepts
    };
  }

  /**
   * Grade student active recall response and update BKT
   */
  async gradeResponse({ topicId, question, studentAnswer, referenceAnswer, keyConcepts, userId }) {
    if (!studentAnswer || studentAnswer.trim() === '') {
      return {
        agent: this.role,
        score: 0,
        isCorrect: false,
        feedback: 'No response submitted. Please type your answer to test recall.'
      };
    }

    const answerLower = studentAnswer.toLowerCase();
    const concepts = Array.isArray(keyConcepts) ? keyConcepts : ['concept'];
    
    // Evaluate concept matches
    let matchedCount = 0;
    const missingConcepts = [];

    for (const concept of concepts) {
      if (answerLower.includes(concept.toLowerCase())) {
        matchedCount++;
      } else {
        missingConcepts.push(concept);
      }
    }

    const matchRatio = matchedCount / Math.max(1, concepts.length);
    const hasSufficientLength = studentAnswer.trim().split(/\s+/).length >= 4;
    const isCorrect = (matchRatio >= 0.50) && hasSufficientLength;
    const score = Math.round(matchRatio * 100);

    let feedback = '';
    if (isCorrect) {
      feedback = `Excellent recall! You accurately captured the key principles (${matchedCount}/${concepts.length} key concepts identified).`;
    } else {
      feedback = `Good attempt, but your recall missed some crucial terms: ${missingConcepts.join(', ') || 'essential definitions'}. Review the reference solution below.`;
    }

    // Record attempt and update BKT!
    let bktResult = null;
    if (userId) {
      bktResult = bktTool.recordPractice(
        userId,
        topicId,
        this.role,
        question,
        studentAnswer,
        isCorrect
      );
    }

    return {
      agent: this.role,
      score,
      isCorrect,
      feedback,
      keyConceptsMatched: matchedCount,
      referenceAnswer,
      bktUpdate: bktResult
    };
  }
}

module.exports = new ActiveRecallAgent();
