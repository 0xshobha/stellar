import { Router } from 'express';
import priceRouter from './price.js';
import newsRouter from './news.js';
import summarizeRouter from './summarize.js';
import sentimentRouter from './sentiment.js';
import mathRouter from './math.js';
import researchRouter from './research.js';

const router = Router();

router.use('/price', priceRouter);
router.use('/news', newsRouter);
router.use('/summarize', summarizeRouter);
router.use('/sentiment', sentimentRouter);
router.use('/math', mathRouter);
router.use('/research', researchRouter);

export default router;
