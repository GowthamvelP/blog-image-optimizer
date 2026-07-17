import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Process an image buffer and generate responsive variants.
 *
 * @param {Buffer} srcBuf - Raw image data.
 * @param {Object} opts
 *   @param {string} filenameBase - Base name for output files (without ext).
 *   @param {string} [alt] - Alt text for markup.
 *   @param {number[]} [widths] - Array of widths to generate.
 *   @param {string[]} [formats] - Output formats (e.g., ['webp','avif']).
 *   @param {number} [quality] - Encoding quality (default 80).
 * @param {string} outDir - Directory where processed files will be written.
 * @returns {Promise<{
 *   pictureHtml: string,
 *   markdown: string,
 *   widths: Array<{width:number, format:string, url:string}>
 * }>}
 */
export async function processImage(srcBuf, opts, outDir) {
  const {
    filenameBase = 'img',
    alt = '',
    widths = [400, 800, 1200, 2000],
    formats = ['webp', 'avif'],
    quality = 80,
  } = opts;

  // Ensure output dir exists
  await fs.mkdir(outDir, { recursive: true });

  const results = [];

  for (const w of widths) {
    for (const fmt of formats) {
      try {
        const outBuf = await sharp(srcBuf)
          .resize({ width: w })
          .toFormat(fmt, { quality })
          .toBuffer();

        const filename = `${filenameBase}-${w}.${fmt}`;
        const outPath = path.join(outDir, filename);
        await fs.writeFile(outPath, outBuf);

        // URL served via the API route /api/images/uploads/<filename>
        const url = `/api/images/uploads/${filename}`;
        results.push({ width: w, format: fmt, url });
      } catch (err) {
        // If a format isn't supported (e.g., avif on older sharp), skip it
        console.warn(`Skipping ${fmt} for width ${w}:`, err.message);
      }
    }
  }

  if (results.length === 0) {
    throw new Error('No image formats could be generated');
  }

  // Determine default image (first result, prefer webp 800w if exists)
  const defaultImg = results.find(r => r.format === 'webp' && r.width === 800) || results[0];

  // Build <picture> markup
  const sourcesByFormat = {};
  results.forEach(r => {
    if (!sourcesByFormat[r.format]) sourcesByFormat[r.format] = [];
    sourcesByFormat[r.format].push(r);
  });

  let picture = '<picture>\n';
  // Order: avif, webp, fallback (we'll output <img> after sources)
  const formatOrder = ['avif', 'webp'];
  formatOrder.forEach(fmt => {
    if (sourcesByFormat[fmt]) {
      const srcSet = sourcesByFormat[fmt]
        .map(r => `${r.url} ${r.width}w`)
        .join(', ');
      picture += `  <source srcset="${srcSet}" type="image/${fmt}">\n`;
    }
  });
  picture += `  <img src="${defaultImg.url}" alt="${alt}" loading="lazy" width="${defaultImg.width}" height="auto">\n`;
  picture += '</picture>';

  // Simple markdown using the default image
  const markdown = `![${alt}](${defaultImg.url})`;

  return {
    pictureHtml: picture,
    markdown,
    widths: results,
  };
}