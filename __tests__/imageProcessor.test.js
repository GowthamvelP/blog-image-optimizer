import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { processImage } from '../lib/imageProcessor';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'test-image.png');

describe('processImage', () => {
  let srcBuf;
  let tmpDir;

  beforeAll(async () => {
    srcBuf = await fs.readFile(FIXTURE_PATH);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'img-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates files for all width/format combinations', async () => {
    const result = await processImage(srcBuf, {
      filenameBase: 'test-img',
      alt: 'A test image',
      widths: [400, 800],
      formats: ['webp'],
      quality: 80,
    }, tmpDir);

    // Should produce 2 files: test-img-400.webp, test-img-800.webp
    const files = await fs.readdir(tmpDir);
    expect(files).toContain('test-img-400.webp');
    expect(files).toContain('test-img-800.webp');
    expect(files.length).toBe(2);
  });

  it('returns correct widths array with url, width, and format', async () => {
    const result = await processImage(srcBuf, {
      filenameBase: 'hero',
      widths: [400],
      formats: ['webp', 'avif'],
    }, tmpDir);

    expect(result.widths).toHaveLength(2);
    expect(result.widths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 400, format: 'webp', url: '/images/uploads/hero-400.webp' }),
        expect.objectContaining({ width: 400, format: 'avif', url: '/images/uploads/hero-400.avif' }),
      ])
    );
  });

  it('generates valid <picture> HTML with sources ordered avif then webp', async () => {
    const result = await processImage(srcBuf, {
      filenameBase: 'pic',
      alt: 'Alt text here',
      widths: [400, 800],
      formats: ['webp', 'avif'],
    }, tmpDir);

    const html = result.pictureHtml;
    expect(html).toContain('<picture>');
    expect(html).toContain('</picture>');
    // AVIF source should appear before WebP source
    const avifPos = html.indexOf('type="image/avif"');
    const webpPos = html.indexOf('type="image/webp"');
    expect(avifPos).toBeLessThan(webpPos);
    // Should include alt text
    expect(html).toContain('alt="Alt text here"');
    // Should include loading="lazy"
    expect(html).toContain('loading="lazy"');
  });

  it('generates markdown with the default fallback image', async () => {
    const result = await processImage(srcBuf, {
      filenameBase: 'md-test',
      alt: 'My image',
      widths: [800],
      formats: ['webp'],
    }, tmpDir);

    expect(result.markdown).toBe('![My image](/images/uploads/md-test-800.webp)');
  });

  it('uses default options when none provided', async () => {
    const result = await processImage(srcBuf, {
      filenameBase: 'defaults',
    }, tmpDir);

    // Default widths: [400, 800, 1200, 2000], formats: ['webp', 'avif'] = 8 files
    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(8);
    // Default alt should be empty
    expect(result.markdown).toContain('![]');
  });

  it('creates the output directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    const result = await processImage(srcBuf, {
      filenameBase: 'nested',
      widths: [400],
      formats: ['webp'],
    }, nestedDir);

    const files = await fs.readdir(nestedDir);
    expect(files).toContain('nested-400.webp');
  });

  it('throws an error when given invalid image data', async () => {
    const invalidBuf = Buffer.from('not an image at all');
    await expect(
      processImage(invalidBuf, {
        filenameBase: 'bad',
        widths: [400],
        formats: ['webp'],
      }, tmpDir)
    ).rejects.toThrow();
  });

  it('prefers webp 800w as the default fallback image', async () => {
    const result = await processImage(srcBuf, {
      filenameBase: 'fallback',
      alt: '',
      widths: [400, 800, 1200],
      formats: ['webp', 'avif'],
    }, tmpDir);

    // The <img> src should be the 800w webp
    expect(result.pictureHtml).toContain('src="/images/uploads/fallback-800.webp"');
  });

  it('includes srcset with width descriptors', async () => {
    const result = await processImage(srcBuf, {
      filenameBase: 'srcset',
      widths: [400, 800],
      formats: ['webp'],
    }, tmpDir);

    expect(result.pictureHtml).toContain('/images/uploads/srcset-400.webp 400w');
    expect(result.pictureHtml).toContain('/images/uploads/srcset-800.webp 800w');
  });
});
