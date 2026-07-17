import { promises as fs } from 'fs';
import path from 'path';

const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'images', 'uploads');

const MIME_TYPES = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  // req.query.path is an array like ['uploads', 'filename.webp']
  const pathParts = req.query.path;
  if (!pathParts || pathParts.length === 0) {
    return res.status(400).json({ error: 'No file specified' });
  }

  // Only allow serving from uploads subdirectory
  const filename = pathParts[pathParts.length - 1];

  // Prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    return res.status(400).json({ error: 'Unsupported file type' });
  }

  const filePath = path.join(uploadDir, filename);

  try {
    const fileBuffer = await fs.readFile(filePath);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', fileBuffer.length);
    return res.status(200).send(fileBuffer);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.status(500).json({ error: 'Failed to read file' });
  }
}
