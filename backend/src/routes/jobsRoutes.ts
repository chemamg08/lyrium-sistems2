import { Router } from 'express';
import { createJob, deleteJob, getJob, getJobs } from '../controllers/jobsController.js';

const router = Router();

router.get('/', getJobs);
router.post('/', createJob);
router.get('/:id', getJob);
router.delete('/:id', deleteJob);

export default router;
