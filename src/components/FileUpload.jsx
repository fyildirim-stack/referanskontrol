import React, { useRef, useState } from 'react';

const UploadIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const ClipboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const FileCheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m9 15 2 2 4-4" />
  </svg>
);

export default function FileUpload({ onSubmit, isLoading }) {
  const [tab, setTab] = useState('file');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && isAcceptedFile(dropped)) {
      setFile(dropped);
    }
  }

  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }

  function isAcceptedFile(f) {
    const ext = f.name.toLowerCase().split('.').pop();
    return ['pdf', 'docx', 'txt'].includes(ext);
  }

  function handleSubmit() {
    if (tab === 'file' && file) {
      onSubmit({ type: 'file', file });
    } else if (tab === 'text' && text.trim()) {
      onSubmit({ type: 'text', text: text.trim() });
    }
  }

  function removeFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const canSubmit = tab === 'file' ? !!file : text.trim().length > 20;

  return (
    <section className="upload-section">
      <div className="upload-card animate-up delay-2">
        {/* Tabs */}
        <div className="upload-tabs">
          <button
            className={`upload-tab ${tab === 'file' ? 'active' : ''}`}
            onClick={() => setTab('file')}
          >
            <FileIcon /> Dosya Yükle
          </button>
          <button
            className={`upload-tab ${tab === 'text' ? 'active' : ''}`}
            onClick={() => setTab('text')}
          >
            <ClipboardIcon /> Metin Yapıştır
          </button>
        </div>

        {/* Body */}
        <div className="upload-body">
          {tab === 'file' ? (
            <>
              {file ? (
                <div className="selected-file">
                  <div className="selected-file-icon">
                    <FileCheckIcon />
                  </div>
                  <div className="selected-file-info">
                    <strong>{file.name}</strong>
                    <span>{formatSize(file.size)}</span>
                  </div>
                  <button
                    className="selected-file-remove"
                    onClick={removeFile}
                    title="Dosyayı kaldır"
                  >
                    <XIcon />
                  </button>
                </div>
              ) : (
                <div
                  className={`dropzone ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileChange}
                  />
                  <div className="dropzone-icon">
                    <UploadIcon />
                  </div>
                  <h3>Kaynakça içeren dosyayı sürükleyip bırakın veya tıklayın</h3>
                  <p>PDF, DOCX veya TXT (maks. 10MB)</p>
                </div>
              )}

              <div className="file-types">
                <span className="file-type-badge"><FileIcon /> PDF</span>
                <span className="file-type-badge"><FileIcon /> DOCX</span>
                <span className="file-type-badge"><FileIcon /> TXT</span>
              </div>
            </>
          ) : (
            <textarea
              className="paste-area"
              placeholder={"Kaynakça\n\n1. Smith, J. (2020). Machine Learning in Healthcare. Journal of AI, 15(3), 45-67.\n2. Özdemir, A. (2019). Yapay Zeka ve Eğitim. Eğitim Bilimleri Dergisi, 8(2), 112-130.\n\nKaynakça metnini buraya yapıştırın..."}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          )}

          <div className="submit-row">
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit || isLoading}
            >
              <CheckIcon />
              Referansları Kontrol Et
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
