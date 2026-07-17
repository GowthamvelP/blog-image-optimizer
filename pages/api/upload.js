import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import formidable from 'formidable';
import { processImage } from '../../lib/imageProcessor';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'images', 'uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

// Output formats: configurable via IMAGE_FORMATS env var (comma-separated)
// Default: 'webp' in production for fast processing, 'webp,avif' locally
const defaultFormats = process.env.NODE_ENV === 'production' ? ['webp'] : ['webp', 'avif'];
const outputFormats = process.env.IMAGE_FORMATS
  ? process.env.IMAGE_FORMATS.split(',').map(f => f.trim())
  : defaultFormats;

// Output widths: configurable via IMAGE_WIDTHS env var (comma-separated)
const outputWidths = process.env.IMAGE_WIDTHS
  ? process.env.IMAGE_WIDTHS.split(',').map(w => parseInt(w.trim(), 10))
  : [400, 800, 1200, 2000];

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

async function processSingleFile(file, { altText, postSlug }) {
  if (!file.mimetype || !allowedTypes.includes(file.mimetype)) {
    return { success: false, error: `Invalid file type for "${file.originalFilename}". Only JPEG, PNG, WebP, SVG allowed.` };
  }

  try {
    const buffer = await fs.readFile(file.filepath);

    const hash = crypto
      .createHash('sha256')
      .update(file.originalFilename || '')
      .update(Date.now().toString())
      .update(Math.random().toString())
      .digest('hex')
      .slice(0, 8);
    const filenameBase = postSlug
      ? `${postSlug.replace(/[^a-z0-9]+/g, '-').toLowerCase()}-${hash}`
      : hash;

    const result = await processImage(buffer, {
      filenameBase,
      alt: altText,
      widths: outputWidths,
      formats: outputFormats,
    }, uploadDir);

    const finalPicture = result.pictureHtml.replace(/(srcset|src)="([^"]+)"/g, (_, attr, value) => {
      if (value.startsWith('/')) {
        return `${attr}="${value}"`;
      }
      return `${attr}="/api/images/uploads/${value.replace(/^\/+/, '')}"`;
    });

    return {
      success: true,
      id: filenameBase,
      originalName: file.originalFilename,
      pictureHtml: finalPicture,
      markdown: result.markdown,
      alt: altText,
      widths: result.widths.map(w => w.width),
    };
  } catch (err) {
    console.error(`Processing error for "${file.originalFilename}":`, err);
    return { success: false, error: `Processing failed for "${file.originalFilename}"` };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: 10 * 1024 * 1024, // 10 MB per file
    maxFiles: 20,
    keepExtensions: true,
  });

  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err) {
    return res.status(400).json({ success: false, error: `Form parsing error: ${err.message}` });
  }

  // Support both single "image" field and multiple "images" fields
  let imageFiles = files.images || files.image;
  if (!imageFiles) {
    return res.status(400).json({ success: false, error: 'No image file(s) provided' });
  }
  if (!Array.isArray(imageFiles)) {
    imageFiles = [imageFiles];
  }

  const altText = (Array.isArray(fields.alt) ? fields.alt[0] : fields.alt || '').toString().trim();
  const postSlug = (Array.isArray(fields.postSlug) ? fields.postSlug[0] : fields.postSlug || '').toString().trim();

  // Parse per-image alt texts (JSON array), falling back to the shared alt for each image
  let perImageAlts = [];
  try {
    const rawAltTexts = Array.isArray(fields.altTexts) ? fields.altTexts[0] : fields.altTexts;
    if (rawAltTexts) {
      perImageAlts = JSON.parse(rawAltTexts);
    }
  } catch {
    // If parsing fails, ignore and use the shared alt
  }

  // Process all files
  const results = await Promise.all(
    imageFiles.map((file, index) => {
      const fileAlt = (perImageAlts[index] || '').trim() || altText;
      return processSingleFile(file, { altText: fileAlt, postSlug });
    })
  );

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  // If only one file was uploaded, return the legacy single-result shape for backward compat
  if (imageFiles.length === 1) {
    const r = results[0];
    if (!r.success) {
      return res.status(400).json({ success: false, error: r.error });
    }
    return res.status(200).json({
      success: true,
      id: r.id,
      pictureHtml: r.pictureHtml,
      markdown: r.markdown,
      alt: r.alt,
      widths: r.widths,
    });
  }

  // Multiple files: return array of results
  return res.status(succeeded.length > 0 ? 200 : 400).json({
    success: succeeded.length > 0,
    results,
    summary: {
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
    },
  });
}
