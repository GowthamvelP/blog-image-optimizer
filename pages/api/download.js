import { promises as fs } from 'fs';
import path from 'path';
import archiver from 'archiver';

const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'images', 'uploads');

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing "id" query parameter' });
  }

  // Sanitize id to prevent directory traversal
  const safeId = id.replace(/[^a-z0-9-]/gi, '');
  if (!safeId) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    // Find all files that start with the given id
    const allFiles = await fs.readdir(uploadDir);
    const matchingFiles = allFiles.filter(f => f.startsWith(safeId));

    if (matchingFiles.length === 0) {
      return res.status(404).json({ error: 'No files found for this upload' });
    }

    // Set response headers for zip download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeId}-images.zip"`);

    // Create zip archive and pipe to response
    const archive = archiver('zip', { zlib: { level: 1 } }); // level 1 = fast (images are already compressed)

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).end();
    });

    archive.pipe(res);

    // Add each matching file to the archive
    for (const filename of matchingFiles) {
      const filePath = path.join(uploadDir, filename);
      archive.file(filePath, { name: filename });
    }

    await archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create download' });
    }
  }
}
