import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

// We test the API handler by sending real HTTP multipart requests to it
// This avoids mocking formidable and tests the full integration path
import handler, { config } from '../pages/api/upload';

const FIXTURE_PNG = path.join(__dirname, 'fixtures', 'test-image.png');
const FIXTURE_TXT = path.join(__dirname, 'fixtures', 'not-an-image.txt');

// Helper: create a minimal multipart/form-data body
function buildMultipart(fields, files) {
  const boundary = '----TestBoundary' + Date.now();
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  for (const { fieldName, filename, contentType, content } of files) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    );
    parts.push(content);
    parts.push('\r\n');
  }

  parts.push(`--${boundary}--\r\n`);

  // Convert to buffer
  const buffers = parts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
  const body = Buffer.concat(buffers);

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// Helper: spin up a temporary server with the handler and send a request
function sendRequest(method, multipartData) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // Patch res.json and res.status to capture response
      let statusCode = 200;
      const originalEnd = res.end.bind(res);

      res.status = (code) => { statusCode = code; return res; };
      res.json = (data) => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        originalEnd(JSON.stringify(data));
      };

      try {
        await handler(req, res);
      } catch (err) {
        res.writeHead(500);
        originalEnd(JSON.stringify({ error: err.message }));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const options = {
        hostname: '127.0.0.1',
        port,
        path: '/api/upload',
        method,
        headers: {},
      };

      if (multipartData) {
        options.headers['Content-Type'] = multipartData.contentType;
        options.headers['Content-Length'] = multipartData.body.length;
      }

      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          server.close();
          const body = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      });

      req.on('error', (err) => { server.close(); reject(err); });

      if (multipartData) {
        req.write(multipartData.body);
      }
      req.end();
    });
  });
}

describe('POST /api/upload', () => {
  let tmpDir;

  beforeAll(async () => {
    // Override UPLOAD_DIR so tests don't write to public/
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-test-'));
    process.env.UPLOAD_DIR = tmpDir;
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  it('rejects non-POST methods', async () => {
    const { status, body } = await sendRequest('GET', null);
    expect(status).toBe(405);
    expect(body.error).toContain('Method not allowed');
  });

  it('rejects requests with no image file', async () => {
    const multipart = buildMultipart({ alt: 'test' }, []);
    const { status, body } = await sendRequest('POST', multipart);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('No image file');
  });

  it('rejects invalid file types', async () => {
    const txtContent = await fs.readFile(FIXTURE_TXT);
    const multipart = buildMultipart({}, [{
      fieldName: 'image',
      filename: 'not-an-image.txt',
      contentType: 'text/plain',
      content: txtContent,
    }]);

    const { status, body } = await sendRequest('POST', multipart);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid file type');
  });

  it('processes a single valid PNG upload', async () => {
    const pngContent = await fs.readFile(FIXTURE_PNG);
    const multipart = buildMultipart(
      { alt: 'Test alt', postSlug: 'my-post' },
      [{
        fieldName: 'image',
        filename: 'test-image.png',
        contentType: 'image/png',
        content: pngContent,
      }]
    );

    const { status, body } = await sendRequest('POST', multipart);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toContain('my-post');
    expect(body.pictureHtml).toContain('<picture>');
    expect(body.pictureHtml).toContain('</picture>');
    expect(body.markdown).toContain('![Test alt]');
    expect(body.alt).toBe('Test alt');
    expect(body.widths).toEqual(expect.arrayContaining([400, 800, 1200, 2000]));
  }, 30000);

  it('processes multiple images and returns array results', async () => {
    const pngContent = await fs.readFile(FIXTURE_PNG);
    const multipart = buildMultipart(
      { alt: 'Shared alt', postSlug: 'batch' },
      [
        {
          fieldName: 'images',
          filename: 'image1.png',
          contentType: 'image/png',
          content: pngContent,
        },
        {
          fieldName: 'images',
          filename: 'image2.png',
          contentType: 'image/png',
          content: pngContent,
        },
      ]
    );

    const { status, body } = await sendRequest('POST', multipart);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(true);
    expect(body.summary.total).toBe(2);
    expect(body.summary.succeeded).toBe(2);
    expect(body.summary.failed).toBe(0);
  }, 30000);

  it('uses per-image alt texts from altTexts JSON field', async () => {
    const pngContent = await fs.readFile(FIXTURE_PNG);
    const altTexts = JSON.stringify(['First image alt', 'Second image alt']);
    const multipart = buildMultipart(
      { alt: 'Default alt', altTexts, postSlug: 'alts' },
      [
        {
          fieldName: 'images',
          filename: 'img1.png',
          contentType: 'image/png',
          content: pngContent,
        },
        {
          fieldName: 'images',
          filename: 'img2.png',
          contentType: 'image/png',
          content: pngContent,
        },
      ]
    );

    const { status, body } = await sendRequest('POST', multipart);
    expect(status).toBe(200);
    expect(body.results[0].alt).toBe('First image alt');
    expect(body.results[1].alt).toBe('Second image alt');
  }, 30000);

  it('falls back to default alt when per-image alt is empty', async () => {
    const pngContent = await fs.readFile(FIXTURE_PNG);
    const altTexts = JSON.stringify(['', '']);
    const multipart = buildMultipart(
      { alt: 'Fallback alt', altTexts, postSlug: 'fallback' },
      [
        {
          fieldName: 'images',
          filename: 'img1.png',
          contentType: 'image/png',
          content: pngContent,
        },
        {
          fieldName: 'images',
          filename: 'img2.png',
          contentType: 'image/png',
          content: pngContent,
        },
      ]
    );

    const { status, body } = await sendRequest('POST', multipart);
    expect(status).toBe(200);
    expect(body.results[0].alt).toBe('Fallback alt');
    expect(body.results[1].alt).toBe('Fallback alt');
  }, 30000);

  it('generates filename with slug prefix when postSlug is provided', async () => {
    const pngContent = await fs.readFile(FIXTURE_PNG);
    const multipart = buildMultipart(
      { postSlug: 'my-blog-post' },
      [{
        fieldName: 'image',
        filename: 'photo.png',
        contentType: 'image/png',
        content: pngContent,
      }]
    );

    const { status, body } = await sendRequest('POST', multipart);
    expect(status).toBe(200);
    // Slug should be lowercased and sanitized (only a-z0-9 and hyphens)
    expect(body.id).toMatch(/^my-blog-post-[a-f0-9]{8}$/);
  }, 30000);

  it('works without alt or postSlug fields', async () => {
    const pngContent = await fs.readFile(FIXTURE_PNG);
    const multipart = buildMultipart({}, [{
      fieldName: 'image',
      filename: 'bare.png',
      contentType: 'image/png',
      content: pngContent,
    }]);

    const { status, body } = await sendRequest('POST', multipart);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.alt).toBe('');
    // ID should be just the hash (no slug prefix)
    expect(body.id).toMatch(/^[a-f0-9]{8}$/);
  }, 30000);
});
