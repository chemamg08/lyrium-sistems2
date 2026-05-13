import { Request, Response } from 'express';
import Suggestion from '../models/Suggestion.js';

export const createSuggestion = async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ error: 'Text exceeds 1000 characters' });
    }
    const suggestion = new Suggestion({ text: text.trim() });
    await suggestion.save();
    res.status(201).json({ message: 'Suggestion created' });
  } catch (err) {
    console.error('Error creating suggestion:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSuggestions = async (req: Request, res: Response) => {
  try {
    const suggestions = await Suggestion.find().sort({ createdAt: -1 });
    res.json(suggestions);
  } catch (err) {
    console.error('Error fetching suggestions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSuggestion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Suggestion.findByIdAndDelete(id);
    res.json({ message: 'Suggestion deleted' });
  } catch (err) {
    console.error('Error deleting suggestion:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
