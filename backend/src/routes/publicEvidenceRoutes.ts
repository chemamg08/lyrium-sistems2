import { Router } from 'express';
import { DefenseEvidence } from '../models/DefenseEvidence.js';

const router = Router();

router.use((_req, res, next) => {
  // Estas evidencias se consumen desde el frontend público y no deben heredar
  // políticas que las bloqueen al pasar por proxy/dominio.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.removeHeader('X-Frame-Options');
  next();
});

router.get('/evidence/:token/metadata', async (req, res) => {
  try {
    const evidence = await DefenseEvidence.findOne({ publicToken: req.params.token, isDeleted: false });
    if (!evidence) return res.status(404).json({ error: 'No encontrado' });
    res.json({
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      fileSize: evidence.fileSize,
      description: evidence.description,
    });
  } catch (error) {
    console.error('Error obteniendo metadatos:', error);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/evidence/:token', async (req, res) => {
  try {
    const evidence = await DefenseEvidence.findOne({ publicToken: req.params.token, isDeleted: false });
    if (!evidence || !evidence.filePath) {
      return res.status(404).send('No encontrado');
    }

    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.resolve(evidence.filePath);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).send('Archivo no encontrado');
    }

    const mime = evidence.mimeType || 'application/octet-stream';
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=300');

    if (mime.startsWith('video/')) {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', 'inline');
    } else if (mime.startsWith('image/')) {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', 'inline');
    } else if (mime.startsWith('audio/')) {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', 'inline');
    } else if (mime === 'application/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    } else {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(evidence.fileName)}"`);
    }

    const { createReadStream } = await import('fs');
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error sirviendo evidencia pública:', error);
    res.status(500).send('Error');
  }
});

export default router;
