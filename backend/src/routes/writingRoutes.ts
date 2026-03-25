import { Router } from 'express';
import {
  getAllWritingTexts,
  getWritingTextById,
  createWritingText,
  updateWritingText,
  deleteWritingText,
  reviewText
} from '../controllers/writingController.js';

const router = Router();

router.get('/', getAllWritingTexts);
router.post('/review', reviewText);
router.get('/:id', getWritingTextById);
router.post('/', createWritingText);
router.put('/:id', updateWritingText);
router.delete('/:id', deleteWritingText);

export default router;
