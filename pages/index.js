import { useState, useRef, useCallback } from 'react';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [altTexts, setAltTexts] = useState([]);
  const [defaultAlt, setDefaultAlt] = useState('');
  const [postSlug, setPostSlug] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(null);
  const fileInputRef = useRef(null);

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

  const acceptFiles = useCallback((incoming) => {
    const valid = [];
    const newPreviews = [];

    for (const f of incoming) {
      if (!allowedTypes.includes(f.type)) {
        setError(`"${f.name}" is not a supported format. Use JPEG, PNG, WebP, or SVG.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        setError(`"${f.name}" exceeds 10 MB.`);
        continue;
      }
      valid.push(f);
      newPreviews.push(URL.createObjectURL(f));
    }

    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...valid]);
      setPreviews((prev) => [...prev, ...newPreviews]);
      setAltTexts((prev) => [...prev, ...valid.map(() => '')]);
      setError(null);
      setResults(null);
    }
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    acceptFiles(dropped);
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files);
    acceptFiles(selected);
    // Reset input so re-selecting the same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setAltTexts((prev) => prev.filter((_, i) => i !== index));
    setResults(null);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Please select at least one image.');
      return;
    }

    setUploading(true);
    setError(null);
    setResults(null);
    setProgress(10);

    const formData = new FormData();
    // Use 'images' for multi, 'image' for single (backward compat with API)
    if (files.length === 1) {
      formData.append('image', files[0]);
    } else {
      files.forEach((f) => formData.append('images', f));
    }
    // Send per-image alt texts as JSON; API uses defaultAlt as fallback
    const resolvedAlts = altTexts.map((a) => a.trim() || defaultAlt.trim());
    formData.append('altTexts', JSON.stringify(resolvedAlts));
    if (defaultAlt.trim()) formData.append('alt', defaultAlt.trim());
    if (postSlug.trim()) formData.append('postSlug', postSlug.trim());

    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 10, 85));
    }, 400);

    try {
      const resp = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      clearInterval(progressInterval);
      setProgress(95);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');
      setProgress(100);

      // Normalize response: single file returns flat object, multi returns { results }
      if (data.results) {
        setResults(data.results);
      } else {
        setResults([data]);
      }
    } catch (err) {
      clearInterval(progressInterval);
      setError(err.message);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 500);
    }
  };

  const handleCopy = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const handleCopyAll = async (field) => {
    const allText = results
      .filter((r) => r.success)
      .map((r) => r[field])
      .join('\n\n');
    await handleCopy(allText, `all-${field}`);
  };

  const handleReset = () => {
    setFiles([]);
    setPreviews((prev) => { prev.forEach(URL.revokeObjectURL); return []; });
    setAltTexts([]);
    setDefaultAlt('');
    setPostSlug('');
    setResults(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <>
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 2rem 1rem;
        }
        .container {
          max-width: 640px;
          margin: 0 auto;
        }
        .card {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
          overflow: hidden;
        }
        .card-header {
          padding: 2rem 2rem 1.5rem;
          text-align: center;
          border-bottom: 1px solid #f0f0f0;
        }
        .card-header h1 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 0.5rem;
        }
        .card-header p {
          color: #6b7280;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .card-body {
          padding: 2rem;
        }
        .dropzone {
          border: 2px dashed #d1d5db;
          border-radius: 12px;
          padding: 2.5rem 1.5rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #fafbfc;
        }
        .dropzone:hover {
          border-color: #667eea;
          background: #f8f9ff;
        }
        .dropzone.dragging {
          border-color: #667eea;
          background: #eef2ff;
          transform: scale(1.01);
        }
        .dropzone.has-file {
          border-style: solid;
          border-color: #10b981;
          background: #f0fdf4;
        }
        .dropzone-icon {
          font-size: 2.5rem;
          margin-bottom: 0.75rem;
        }
        .dropzone-text {
          color: #6b7280;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
        }
        .dropzone-hint {
          color: #9ca3af;
          font-size: 0.75rem;
        }
        .file-list {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .file-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem;
          background: #fff;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        .file-preview {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .file-preview img {
          width: 48px;
          height: 48px;
          object-fit: cover;
          border-radius: 6px;
        }
        .file-info {
          flex: 1;
          min-width: 0;
        }
        .file-name {
          font-size: 0.85rem;
          font-weight: 500;
          color: #1a1a2e;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .file-size {
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 2px;
        }
        .file-alt-input {
          font-size: 0.8rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: #f9fafb;
        }
        .file-alt-input:focus {
          background: #fff;
        }
        .remove-btn {
          background: none;
          border: none;
          color: #ef4444;
          cursor: pointer;
          font-size: 1.2rem;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          transition: background 0.15s;
        }
        .remove-btn:hover {
          background: #fef2f2;
        }
        .file-count {
          font-size: 0.8rem;
          color: #6b7280;
          margin-top: 0.75rem;
          text-align: center;
        }
        .form-group {
          margin-top: 1.25rem;
        }
        .form-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.4rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .form-input {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.875rem;
          color: #1a1a2e;
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
        }
        .form-input:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .form-input::placeholder {
          color: #9ca3af;
        }
        .submit-btn {
          display: block;
          width: 100%;
          margin-top: 1.5rem;
          padding: 0.875rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          opacity: 0.95;
        }
        .submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .progress-bar {
          width: 100%;
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          margin-top: 1rem;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 2px;
          transition: width 0.3s ease;
        }
        .results-container {
          margin-top: 1.5rem;
        }
        .results-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .results-title {
          font-size: 1rem;
          font-weight: 600;
          color: #1a1a2e;
        }
        .results-summary {
          font-size: 0.8rem;
          color: #6b7280;
        }
        .copy-all-buttons {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .result-section {
          padding: 1.25rem;
          background: #f8fafc;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          margin-bottom: 1rem;
        }
        .result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }
        .result-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: #1a1a2e;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 70%;
        }
        .result-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.625rem;
          background: #ecfdf5;
          color: #059669;
          border-radius: 99px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .result-badge-error {
          background: #fef2f2;
          color: #dc2626;
        }
        .code-block {
          background: #1e293b;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace;
          font-size: 0.75rem;
          line-height: 1.6;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 160px;
          overflow-y: auto;
        }
        .copy-buttons {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }
        .copy-btn {
          flex: 1;
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }
        .copy-btn-primary {
          background: #667eea;
          color: #fff;
          border: none;
        }
        .copy-btn-primary:hover {
          background: #5a6fd6;
        }
        .copy-btn-secondary {
          background: #fff;
          color: #374151;
          border: 1px solid #d1d5db;
        }
        .copy-btn-secondary:hover {
          background: #f9fafb;
        }
        .copy-btn.copied {
          background: #10b981;
          color: #fff;
          border-color: #10b981;
        }
        .download-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          width: 100%;
          margin-top: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
          text-decoration: none;
        }
        .download-btn:hover {
          background: #dcfce7;
        }
        .error-box {
          margin-top: 1rem;
          padding: 0.875rem 1rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #dc2626;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .reset-btn {
          display: block;
          width: 100%;
          margin-top: 0.75rem;
          padding: 0.625rem;
          background: transparent;
          color: #6b7280;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        .reset-btn:hover {
          background: #f9fafb;
          color: #374151;
        }
        .footer {
          text-align: center;
          margin-top: 1.5rem;
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.8rem;
        }
        .footer a {
          color: rgba(255, 255, 255, 0.9);
          text-decoration: none;
        }
        .widths-info {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          margin-top: 0.75rem;
        }
        .width-tag {
          padding: 0.2rem 0.5rem;
          background: #eef2ff;
          color: #4338ca;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 500;
        }
      `}</style>

      <div className="container">
        <div className="card">
          <div className="card-header">
            <h1>Image Optimizer</h1>
            <p>
              Upload one or more images and get responsive, SEO-ready markup for your blog.
              Generates WebP + AVIF at multiple sizes automatically.
            </p>
          </div>

          <div className="card-body">
            {!results ? (
              <form onSubmit={handleSubmit}>
                {/* Drop zone */}
                <div
                  className={`dropzone ${isDragging ? 'dragging' : ''} ${files.length > 0 ? 'has-file' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    onChange={handleFileChange}
                    multiple
                    style={{ display: 'none' }}
                  />
                  <div className="dropzone-icon">
                    {isDragging ? '\uD83D\uDCE5' : '\uD83D\uDDBC\uFE0F'}
                  </div>
                  <p className="dropzone-text">
                    Drop your images here, or <strong>click to browse</strong>
                  </p>
                  <p className="dropzone-hint">
                    JPEG, PNG, WebP, SVG up to 10 MB each &middot; Multiple files supported
                  </p>
                </div>

                {/* File list */}
                {files.length > 0 && (
                  <>
                    <div className="file-list">
                      {files.map((f, i) => (
                        <div className="file-item" key={`${f.name}-${i}`}>
                          <div className="file-preview">
                            <img src={previews[i]} alt="Preview" />
                            <div className="file-info">
                              <div className="file-name">{f.name}</div>
                              <div className="file-size">
                                {formatSize(f.size)} &middot; {f.type.split('/')[1].toUpperCase()}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="remove-btn"
                              onClick={() => handleRemoveFile(i)}
                              aria-label={`Remove ${f.name}`}
                            >
                              &times;
                            </button>
                          </div>
                          <input
                            className="form-input file-alt-input"
                            type="text"
                            placeholder={defaultAlt || 'Alt text for this image'}
                            value={altTexts[i] || ''}
                            onChange={(e) => {
                              const updated = [...altTexts];
                              updated[i] = e.target.value;
                              setAltTexts(updated);
                            }}
                            aria-label={`Alt text for ${f.name}`}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="file-count">
                      {files.length} {files.length === 1 ? 'file' : 'files'} selected
                    </p>
                  </>
                )}

                {/* Form fields */}
                <div className="form-group">
                  <label className="form-label" htmlFor="alt-input">
                    Default Alt Text {files.length > 1 && '(fallback for images without individual alt)'}
                  </label>
                  <input
                    id="alt-input"
                    className="form-input"
                    type="text"
                    placeholder="Applied to images that don't have individual alt text above"
                    value={defaultAlt}
                    onChange={(e) => setDefaultAlt(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="slug-input">
                    Post Slug
                  </label>
                  <input
                    id="slug-input"
                    className="form-input"
                    type="text"
                    placeholder="e.g. my-blog-post (used in the filename)"
                    value={postSlug}
                    onChange={(e) => setPostSlug(e.target.value)}
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={files.length === 0 || uploading}
                >
                  {uploading
                    ? 'Processing...'
                    : files.length > 1
                      ? `Optimize ${files.length} Images`
                      : 'Optimize & Generate Code'}
                </button>

                {/* Progress bar */}
                {uploading && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="error-box">
                    <span>&#9888;&#65039;</span>
                    {error}
                  </div>
                )}
              </form>
            ) : (
              <>
                {/* Results */}
                <div className="results-container">
                  <div className="results-header">
                    <span className="results-title">Generated Markup</span>
                    <span className="results-summary">
                      {results.filter((r) => r.success).length} of {results.length} processed
                    </span>
                  </div>

                  {/* Copy all buttons (only for multi-result) */}
                  {results.filter((r) => r.success).length > 1 && (
                    <div className="copy-all-buttons">
                      <button
                        className={`copy-btn copy-btn-primary ${copied === 'all-pictureHtml' ? 'copied' : ''}`}
                        onClick={() => handleCopyAll('pictureHtml')}
                      >
                        {copied === 'all-pictureHtml' ? '\u2713 Copied!' : 'Copy All HTML'}
                      </button>
                      <button
                        className={`copy-btn copy-btn-secondary ${copied === 'all-markdown' ? 'copied' : ''}`}
                        onClick={() => handleCopyAll('markdown')}
                      >
                        {copied === 'all-markdown' ? '\u2713 Copied!' : 'Copy All Markdown'}
                      </button>
                    </div>
                  )}

                  {results.map((r, i) => (
                    <div className="result-section" key={i}>
                      <div className="result-header">
                        <span className="result-title">
                          {r.originalName || r.id || `Image ${i + 1}`}
                        </span>
                        {r.success ? (
                          <span className="result-badge">&#10003; Ready</span>
                        ) : (
                          <span className="result-badge result-badge-error">&#10007; Failed</span>
                        )}
                      </div>

                      {r.success ? (
                        <>
                          <div className="code-block">{r.pictureHtml}</div>

                          <div className="copy-buttons">
                            <button
                              className={`copy-btn copy-btn-primary ${copied === `html-${i}` ? 'copied' : ''}`}
                              onClick={() => handleCopy(r.pictureHtml, `html-${i}`)}
                            >
                              {copied === `html-${i}` ? '\u2713 Copied!' : 'Copy HTML'}
                            </button>
                            <button
                              className={`copy-btn copy-btn-secondary ${copied === `md-${i}` ? 'copied' : ''}`}
                              onClick={() => handleCopy(r.markdown, `md-${i}`)}
                            >
                              {copied === `md-${i}` ? '\u2713 Copied!' : 'Copy Markdown'}
                            </button>
                          </div>

                          <a
                            className="download-btn"
                            href={`/api/download?id=${encodeURIComponent(r.id)}`}
                            download
                          >
                            &#11015; Download Images (.zip)
                          </a>

                          {r.alt && (
                            <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>
                              Alt: <strong>{r.alt}</strong>
                            </p>
                          )}

                          <div className="widths-info">
                            {(r.widths || []).map((w) => (
                              <span key={`${i}-${w}`} className="width-tag">{w}px</span>
                            ))}
                            <span className="width-tag">WebP</span>
                            <span className="width-tag">AVIF</span>
                          </div>
                        </>
                      ) : (
                        <p style={{ fontSize: '0.85rem', color: '#dc2626' }}>{r.error}</p>
                      )}
                    </div>
                  ))}
                </div>

                <button className="reset-btn" onClick={handleReset}>
                  Upload More Images
                </button>
              </>
            )}
          </div>
        </div>

        <p className="footer">
          Powered by Next.js &amp; Sharp &middot; Images saved to <code>/public/images/uploads/</code>
        </p>
      </div>
    </>
  );
}
