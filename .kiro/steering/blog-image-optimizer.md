---
inclusion: always
---

# Blog Image Optimizer

## Project Overview

A Next.js 14 (Pages Router) application that accepts image uploads and generates responsive, SEO-optimized `<picture>` markup with WebP and AVIF variants at multiple breakpoints. Uses Sharp for server-side image processing.

## Tech Stack

- **Framework:** Next.js 14.2 with Pages Router (`pages/` directory)
- **Runtime:** Node.js 20
- **Image Processing:** Sharp 0.33
- **File Uploads:** Formidable 3.x (disables Next.js body parser on the API route)
- **Styling:** CSS-in-JS via `<style jsx global>` (no external CSS framework)
- **Deployment:** Docker (multi-stage build), docker-compose with volume-mounted uploads

## Architecture

```
pages/index.js        → Single-page upload UI (React, client-side only)
pages/api/upload.js   → POST endpoint: parses multipart form, validates, delegates to imageProcessor
lib/imageProcessor.js → Core logic: resizes with Sharp, writes variants, returns HTML/Markdown
public/images/uploads → Persistent output directory for generated images
```

## Code Conventions

- Plain JavaScript (no TypeScript). Do not introduce TypeScript.
- ES module syntax (`import`/`export`) throughout.
- Functional React components with hooks; no class components.
- No external UI component library — all styles are inline `<style jsx global>` in page components.
- JSDoc comments for exported utility functions (see `processImage` as the reference).
- Keep files small and focused. One API route per file under `pages/api/`.

## Image Processing Rules

- Default output widths: `[400, 800, 1200, 2000]`.
- Default output formats: `['webp', 'avif']`.
- Default quality: `80`.
- Filenames follow the pattern: `{slug}-{hash}-{width}.{format}`.
- The `<picture>` element lists `<source>` elements in order: AVIF first, WebP second, with an `<img>` fallback.
- Always include `loading="lazy"` on the fallback `<img>`.

## API Design

- The upload endpoint lives at `POST /api/upload`.
- Body parser is disabled (`export const config = { api: { bodyParser: false } }`); use Formidable for multipart parsing.
- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`.
- Max file size: 5 MB (enforced on both client and server).
- Return JSON with shape: `{ success, id, pictureHtml, markdown, alt, widths }`.
- Return appropriate HTTP status codes: 400 for bad input, 405 for wrong method, 500 for processing errors.

## Frontend Patterns

- The UI is a single page (`pages/index.js`) with no routing.
- Drag-and-drop and click-to-browse file selection.
- Client-side validation mirrors server rules (file type, size).
- Simulated upload progress bar (fetch does not expose real progress).
- Copy-to-clipboard for generated HTML and Markdown snippets.

## Development & Deployment

- `npm run dev` — local development server (port 3000).
- `npm run build && npm start` — production build.
- `docker-compose up --build` — containerized run (host port 3001 → container 3000).
- Uploads persist via Docker volume mount at `./public/images/uploads`.
- The `UPLOAD_DIR` env var can override the default upload directory.

## Guidelines

- Do not add a database; generated files are the source of truth.
- Do not add authentication; this is a personal/internal tool.
- Keep dependencies minimal — avoid adding packages unless strictly necessary.
- When modifying image processing, ensure backward compatibility with existing filenames on disk.
- Any new API endpoints should follow the same pattern: disable body parser, use Formidable, validate input, return consistent JSON.