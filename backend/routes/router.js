const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const learnerRoutes = require('./learner');
const syllabusRoutes = require('./syllabus');
const agentRoutes = require('./agents');
const revisionRoutes = require('./revision');
const recallRoutes = require('./recall');
const mockRoutes = require('./mock');
const flashcardRoutes = require('./flashcards');

// Mount routes
router.use('/auth', authRoutes);
router.use('/learner', learnerRoutes);
router.use('/syllabus', syllabusRoutes);
router.use('/agents', agentRoutes);
router.use('/revision', revisionRoutes);
router.use('/recall', recallRoutes);
router.use('/mock', mockRoutes);
router.use('/flashcards', flashcardRoutes);

module.exports = router;
