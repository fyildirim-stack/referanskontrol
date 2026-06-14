import React, { useMemo, useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileCheck2, FileJson, FileText, Search, UploadCloud } from "lucide-react";
import { analyzeDocx, analyzePdf, convertDocxToFootnotes } from "./wordProcessor.js";
import { exportBibtex, exportCslJson, exportRis } from "./zoteroExport.js";
import "./styles.css";

// Online verification imports
import Navbar from './components/Navbar.jsx';
import FileUpload from './components/FileUpload.jsx';
import FAQ from './components/FAQ.jsx';
import ReferenceCard from './components/ReferenceCard.jsx';
import { parseReferences, extractBibliographySection } from './services/referenceParser.js';
import { verifyReferences } from './services/academicVerifier.js';
import { readTxtFile, parseTxtBibliography } from './parsers/txtParser.js';
import { readPdfFile, parsePdfBibliography } from './pdfParser.js';
import { calculateStats, generateTextReport } from './services/reportGenerator.js';

// DOCX text extraction helper
async function readDocxText(file) {
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('Geçerli bir Word belgesi değil.');

  const xml = await xmlFile.async('string');

  return xml
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function App() {
  const [activeTab, setActiveTab] = useState("in-text"); // "in-text", "footnote", or "online-check"

  // Theme
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("rc-theme");
    if (saved) return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("rc-theme", theme);
  }, [theme]);

  // --- Offline States (In-Text & Footnote Tabs) ---
  const [inTextFile, setInTextFile] = useState(null);
  const [inTextStatus, setInTextStatus] = useState("idle");
  const [inTextAnalysis, setInTextAnalysis] = useState(null);
  const [inTextConvertedBlob, setInTextConvertedBlob] = useState(null);
  const [inTextError, setInTextError] = useState("");
  const [inTextApprovedIds, setInTextApprovedIds] = useState(new Set());

  const [footnoteFile, setFootnoteFile] = useState(null);
  const [footnoteStatus, setFootnoteStatus] = useState("idle");
  const [footnoteAnalysis, setFootnoteAnalysis] = useState(null);
  const [footnoteError, setFootnoteError] = useState("");
  const [footnoteApprovedIds, setFootnoteApprovedIds] = useState(new Set());

  // --- Online Verification States (Online Check Tab) ---
  const [onlineResults, setOnlineResults] = useState([]);
  const [onlineFileName, setOnlineFileName] = useState('');
  const [onlineStatus, setOnlineStatus] = useState('idle'); // 'idle', 'verifying', 'ready'
  const [onlineProgress, setOnlineProgress] = useState({ done: 0, total: 0 });
  const [onlineError, setOnlineError] = useState('');
  const [onlineFilter, setOnlineFilter] = useState('all');

  const isInText = activeTab === "in-text";
  const isFootnote = activeTab === "footnote";
  const isOnline = activeTab === "online-check";

  // Selectors for offline checks
  const offlineFile = isInText ? inTextFile : footnoteFile;
  const offlineStatus = isInText ? inTextStatus : footnoteStatus;
  const offlineAnalysis = isInText ? inTextAnalysis : footnoteAnalysis;
  const offlineError = isInText ? inTextError : footnoteError;
  const offlineApprovedIds = isInText ? inTextApprovedIds : footnoteApprovedIds;
  const setOfflineApprovedIds = isInText ? setInTextApprovedIds : setFootnoteApprovedIds;
  const inTextConverted = isInText ? inTextConvertedBlob : null;

  const offlineFileNameText = offlineFile?.name ?? "";
  const uniqueMissing = isInText ? (offlineAnalysis?.missingUnique ?? []) : [];
  const missingFootnoteUnique = !isInText ? (offlineAnalysis?.missingFootnoteUnique ?? []) : [];
  const unresolvedFootnote = !isInText ? (offlineAnalysis?.unresolvedFootnoteCitations ?? []) : [];
  const verificationRecords = offlineAnalysis?.verificationRecords ?? [];
  const approvedRecords = verificationRecords.filter((record) => offlineApprovedIds.has(record.id));

  // --- Offline Handlers ---
  async function handleOfflineFile(nextFile) {
    if (!nextFile) return;
    const isPdf = nextFile.name.toLowerCase().endsWith(".pdf");

    if (isInText) {
      setInTextFile(nextFile);
      setInTextStatus("analyzing");
      setInTextAnalysis(null);
      setInTextConvertedBlob(null);
      setInTextApprovedIds(new Set());
      setInTextError("");

      try {
        const result = isPdf ? await analyzePdf(nextFile) : await analyzeDocx(nextFile);
        setInTextAnalysis(result);
        setInTextStatus("ready");
      } catch (err) {
        setInTextStatus("error");
        setInTextError(err.message || "Belge okunamadı.");
      }
    } else {
      setFootnoteFile(nextFile);
      setFootnoteStatus("analyzing");
      setFootnoteAnalysis(null);
      setFootnoteApprovedIds(new Set());
      setFootnoteError("");

      try {
        const result = isPdf ? await analyzePdf(nextFile) : await analyzeDocx(nextFile);
        setFootnoteAnalysis(result);
        setFootnoteStatus("ready");
      } catch (err) {
        setFootnoteStatus("error");
        setFootnoteError(err.message || "Belge okunamadı.");
      }
    }
  }

  async function handleConvert() {
    if (!inTextFile || !inTextAnalysis) return;
    setInTextStatus("converting");
    setInTextError("");

    try {
      const blob = await convertDocxToFootnotes(inTextFile, inTextAnalysis);
      setInTextConvertedBlob(blob);
      setInTextStatus("converted");
    } catch (err) {
      setInTextStatus("error");
      setInTextError(err.message || "Dönüştürme tamamlanamadı.");
    }
  }

  function toggleOfflineApproved(id) {
    setOfflineApprovedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadOfflineReport() {
    if (!offlineAnalysis) return;
    let lines = [];
    if (isInText) {
      lines = [
        "APA Metin İçi Atıf Denetim Raporu",
        `Dosya: ${offlineFileNameText}`,
        `Tarih: ${new Date().toLocaleString("tr-TR")}`,
        "",
        `Metin içi atıf: ${offlineAnalysis.citations.length}`,
        `Kaynakça girdisi: ${offlineAnalysis.references.length}`,
        `Kaynakçada bulunmayan tekil kaynak: ${uniqueMissing.length}`,
        `Kaynakçada bulunmayan atıf geçişi: ${offlineAnalysis.missing.length}`,
        `Zotero için onaylanan kaynak: ${approvedRecords.length}`,
        "",
        "Kaynakçada bulunmayan tekil kaynaklar:",
        ...uniqueMissing.map((item) => `- ${item.display} | ${item.occurrences ?? 1} geçiş | paragraf ${formatParagraphs(item)}`),
        "",
        "Kaynak doğrulama kayıtları:",
        ...verificationRecords.map((item) => `- ${item.display} | ${item.status}`),
      ];
      downloadBlob(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), "apa-metin-ici-atif-denetim-raporu.txt");
    } else {
      lines = [
        "İSNAD/Chicago Dipnotlu Atıf Denetim Raporu",
        `Dosya: ${offlineFileNameText}`,
        `Tarih: ${new Date().toLocaleString("tr-TR")}`,
        "",
        `Dipnot atfı: ${offlineAnalysis.footnoteCitations?.length ?? 0}`,
        `Kaynakça girdisi: ${offlineAnalysis.references.length}`,
        `Kaynakçada bulunmayan tekil dipnot kaynağı: ${missingFootnoteUnique.length}`,
        `Çözümlenemeyen dipnot: ${unresolvedFootnote.length}`,
        `Zotero için onaylanan kaynak: ${approvedRecords.length}`,
        "",
        "Kaynakçada bulunmayan tekil dipnot kaynakları:",
        ...missingFootnoteUnique.map((item) => `- ${item.display} | ${item.occurrences ?? 1} geçiş`),
        "",
        "Çözümlenemeyen dipnotlar:",
        ...unresolvedFootnote.map((item) => `- Dipnot ${item.id}: ${item.text}`),
        "",
        "Kaynak doğrulama kayıtları:",
        ...verificationRecords.map((item) => `- ${item.display} | ${item.status}`),
      ];
      downloadBlob(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), "chicago-isnad-dipnot-atif-denetim-raporu.txt");
    }
  }

  function downloadConverted() {
    if (!inTextConvertedBlob || !inTextFile) return;
    downloadBlob(inTextConvertedBlob, inTextFile.name.replace(/\.docx$/i, "") + "-dipnotlu.docx");
  }

  function downloadZotero(format) {
    const records = approvedRecords.length ? approvedRecords : verificationRecords;
    if (!records.length) return;
    if (format === "json") {
      downloadBlob(new Blob([exportCslJson(records)], { type: "application/json;charset=utf-8" }), "zotero-csl-json.json");
    }
    if (format === "ris") {
      downloadBlob(new Blob([exportRis(records)], { type: "application/x-research-info-systems;charset=utf-8" }), "zotero-kaynaklar.ris");
    }
    if (format === "bib") {
      downloadBlob(new Blob([exportBibtex(records)], { type: "application/x-bibtex;charset=utf-8" }), "zotero-kaynaklar.bib");
    }
  }

  // --- Online Handlers ---
  const handleOnlineSubmit = useCallback(async (input) => {
    setOnlineStatus('verifying');
    setOnlineError('');
    setOnlineProgress({ done: 0, total: 0 });

    try {
      let bibText = null;
      let inputFileName = '';

      if (input.type === 'file') {
        const file = input.file;
        inputFileName = file.name;
        const ext = file.name.toLowerCase().split('.').pop();

        if (ext === 'txt') {
          const text = await readTxtFile(file);
          bibText = parseTxtBibliography(text);
        } else if (ext === 'pdf') {
          const text = await readPdfFile(file);
          bibText = parsePdfBibliography(text);
        } else if (ext === 'docx') {
          const text = await readDocxText(file);
          bibText = extractBibliographySection(text);
        } else {
          throw new Error('Desteklenmeyen dosya formatı. PDF, DOCX veya TXT kullanın.');
        }
      } else if (input.type === 'text') {
        inputFileName = 'Metin girişi';
        bibText = parseTxtBibliography(input.text);
        if (!bibText) bibText = input.text;
      }

      if (!bibText || bibText.trim().length < 10) {
        throw new Error(
          'Kaynakça bölümü bulunamadı. Lütfen kaynakça bölümünüzün "Kaynakça", "Kaynaklar" veya "References" başlığı ile başladığından emin olun.'
        );
      }

      const parsedRefs = parseReferences(bibText);
      if (parsedRefs.length === 0) {
        throw new Error('Ayrıştırılabilecek referans bulunamadı. Lütfen kaynakça formatınızı kontrol edin.');
      }

      setOnlineProgress({ done: 0, total: parsedRefs.length });

      const verificationResults = await verifyReferences(parsedRefs, (done, total) => {
        setOnlineProgress({ done, total });
      });

      setOnlineResults(verificationResults);
      setOnlineFileName(inputFileName);
      setOnlineStatus('ready');
    } catch (err) {
      setOnlineError(err.message || 'Beklenmeyen bir hata oluştu.');
      setOnlineStatus('idle');
    }
  }, []);

  function handleOnlineGoBack() {
    setOnlineStatus('idle');
    setOnlineResults([]);
    setOnlineFileName('');
    setOnlineError('');
  }

  const onlineStats = useMemo(() => calculateStats(onlineResults), [onlineResults]);

  const filteredOnlineResults = useMemo(() => {
    if (onlineFilter === 'found') return onlineResults.filter(r => r.found);
    if (onlineFilter === 'not-found') return onlineResults.filter(r => !r.found);
    return onlineResults;
  }, [onlineResults, onlineFilter]);

  function handleDownloadOnlineReport() {
    const report = generateTextReport(onlineResults, onlineFileName);
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, 'referans-dogrulama-raporu.txt');
  }

  return (
    <>
      <Navbar theme={theme} setTheme={setTheme} />

      <main className="shell">
        {/* Unified Tab Navigation */}
        <nav className="tab-bar animate-in">
          <button
            type="button"
            className={`tab-button ${isInText ? "active" : ""}`}
            onClick={() => setActiveTab("in-text")}
          >
            <Search size={16} />
            Metin İçi Atıf Kontrolü (APA)
          </button>
          <button
            type="button"
            className={`tab-button ${isFootnote ? "active" : ""}`}
            onClick={() => setActiveTab("footnote")}
          >
            <FileText size={16} />
            Dipnotlu Atıf Kontrolü (İSNAD)
          </button>
          <button
            type="button"
            className={`tab-button ${isOnline ? "active" : ""}`}
            onClick={() => setActiveTab("online-check")}
          >
            <CheckCircle2 size={16} />
            Online Referans Doğrulama
          </button>
        </nav>

        {/* --- SECTION 1: OFFLINE TABS (APA / CHICAGO) --- */}
        {(isInText || isFootnote) && (
          <>
            <section className="topbar" style={{ marginTop: 12 }}>
              <div>
                <h2>
                  {isInText
                    ? "Metin İçi Atıf ve Kaynakça Karşılaştırma"
                    : "Dipnotlu Atıf ve Kaynakça Karşılaştırma"}
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {isInText
                    ? "Word veya PDF belgenizdeki metin içi atıfları (APA stili) kaynakçayla karşılaştırır. Atıfları dipnota da dönüştürebilir."
                    : "Word veya PDF belgenizdeki dipnot atıflarını (İSNAD/Chicago stili) kaynakçayla karşılaştırır, kısaltmaları çözümler."}
                </p>
              </div>
              <span className="privacy">v0.4.0 (Offline)</span>
            </section>

            <section className="workspace">
              <label className="dropzone">
                <input type="file" accept=".docx,.pdf" onChange={(event) => handleOfflineFile(event.target.files?.[0])} />
                <UploadCloud size={42} />
                <strong>{offlineFileNameText || "Word veya PDF belgesini seçin"}</strong>
                <span>
                  Kaynakça başlığı “Kaynakça”, “Kaynaklar” veya “References” olarak ayrılmış olmalı.
                </span>
              </label>

              <div className="actions">
                {isInText ? (
                  <>
                    <button type="button" onClick={handleConvert} disabled={!offlineAnalysis || offlineStatus === "converting" || !offlineFile?.name?.toLowerCase().endsWith(".docx")}>
                      <FileCheck2 size={18} />
                      Dipnotlu Word oluştur
                    </button>
                    <button type="button" className="secondary" onClick={downloadOfflineReport} disabled={!offlineAnalysis}>
                      <Download size={18} />
                      Rapor indir
                    </button>
                    <button type="button" className="secondary" onClick={downloadConverted} disabled={!inTextConverted}>
                      <FileText size={18} />
                      Word indir
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={downloadOfflineReport} disabled={!offlineAnalysis}>
                    <Download size={18} />
                    Rapor indir
                  </button>
                )}
              </div>

              {offlineStatus !== "idle" && (
                <div className={`notice ${offlineStatus === "error" ? "bad" : ""}`}>
                  {offlineStatus === "analyzing" && "Belge analiz ediliyor..."}
                  {offlineStatus === "ready" && "Belge analizi tamamlandı. Kaynak eşleşmeleri ve Zotero kayıtları hazır."}
                  {offlineStatus === "converting" && "Word dosyası İSNAD dipnot formatına dönüştürülüyor..."}
                  {offlineStatus === "converted" && "Dipnotlu Word dosyası hazır."}
                  {offlineStatus === "error" && offlineError}
                </div>
              )}
            </section>

            {offlineAnalysis && (
              <section className="results">
                {isInText ? (
                  <>
                    <Metric icon={<Search />} label="Metin içi atıf" value={offlineAnalysis.citations.length} />
                    <Metric icon={<FileText />} label="Kaynakça girdisi" value={offlineAnalysis.references.length} />
                    <Metric icon={<FileJson />} label="Zotero kaydı" value={verificationRecords.length} />
                    <Metric
                      icon={uniqueMissing.length ? <AlertTriangle /> : <CheckCircle2 />}
                      label="Tekil eksik kaynak"
                      value={uniqueMissing.length}
                      tone={uniqueMissing.length ? "warn" : "ok"}
                    />
                  </>
                ) : (
                  <>
                    <Metric icon={<FileText />} label="Dipnot atfı" value={offlineAnalysis.footnoteCitations?.length ?? 0} />
                    <Metric icon={<FileText />} label="Kaynakça girdisi" value={offlineAnalysis.references.length} />
                    <Metric icon={<FileJson />} label="Zotero kaydı" value={verificationRecords.length} />
                    <Metric
                      icon={missingFootnoteUnique.length ? <AlertTriangle /> : <CheckCircle2 />}
                      label="Tekil eksik dipnot"
                      value={missingFootnoteUnique.length}
                      tone={missingFootnoteUnique.length ? "warn" : "ok"}
                    />
                    <Metric
                      icon={unresolvedFootnote.length ? <AlertTriangle /> : <CheckCircle2 />}
                      label="Çözümlenemeyen dipnot"
                      value={unresolvedFootnote.length}
                      tone={unresolvedFootnote.length ? "warn" : "ok"}
                    />
                  </>
                )}
              </section>
            )}

            {offlineAnalysis && (
              <section className="verification-panel">
                <div className="panel-head">
                  <div>
                    <h2>Kaynak Doğrulama ve Zotero Export</h2>
                    <p>Onaylanan kayıtlar CSL-JSON, RIS veya BibTeX olarak indirilebilir.</p>
                  </div>
                  <div className="export-actions">
                    <button type="button" className="secondary" onClick={() => downloadZotero("json")} disabled={!verificationRecords.length}>
                      <FileJson size={17} />
                      CSL-JSON
                    </button>
                    <button type="button" className="secondary" onClick={() => downloadZotero("ris")} disabled={!verificationRecords.length}>
                      <Download size={17} />
                      RIS
                    </button>
                    <button type="button" className="secondary" onClick={() => downloadZotero("bib")} disabled={!verificationRecords.length}>
                      <Download size={17} />
                      BibTeX
                    </button>
                  </div>
                </div>
                <div className="source-list">
                  {verificationRecords.map((record) => (
                    <article className="source-row" key={record.id}>
                      <label className="approve">
                        <input type="checkbox" checked={offlineApprovedIds.has(record.id)} onChange={() => toggleOfflineApproved(record.id)} />
                        <span>✓ Onayla</span>
                      </label>
                      <div className="source-main">
                        <strong>{record.display}</strong>
                        <span>{record.type}</span>
                        <small>
                          {record.url ? (
                            <a className="source-url" href={record.url} target="_blank" rel="noreferrer">{record.url}</a>
                          ) : (
                            record.doi || record.query
                          )}
                        </small>
                      </div>
                      <a className="open-link" href={record.verificationUrl || record.scholarUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} />
                        {record.verificationLabel || "Aç"}
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {offlineAnalysis && (
              <section className="columns">
                {isInText ? (
                  <>
                    <Panel title="Kaynakçada Yer Almayan Tekil Kaynaklar" empty="Tüm bulunan metin içi atıflar kaynakçada eşleşti.">
                      {uniqueMissing.map((item) => (
                        <article className="row warn-row" key={`${item.keys?.join("-")}-${item.display}`}>
                          <strong>{item.display}</strong>
                          <span>{item.occurrences ?? 1} geçiş | Paragraf {formatParagraphs(item)}</span>
                        </article>
                      ))}
                    </Panel>

                    <Panel title="Bulunan Metin İçi Atıflar" empty="Henüz atıf bulunmadı.">
                      {offlineAnalysis.citations.slice(0, 80).map((item) => (
                        <article className="row" key={`${item.paragraphIndex}-${item.start}-${item.display}`}>
                          <strong>{item.display}</strong>
                          <span>{item.kind === "parenthetical" ? "Parantez içi" : "Anlatı atfı"} | Paragraf {item.paragraphIndex + 1}</span>
                        </article>
                      ))}
                    </Panel>
                  </>
                ) : (
                  <>
                    <Panel title="Kaynakçada Yer Almayan Tekil Dipnot Kaynakları" empty="Tüm dipnot atıfları kaynakçada eşleşti.">
                      {missingFootnoteUnique.map((item) => (
                        <article className="row warn-row" key={`${item.keys?.join("-")}-${item.display}`}>
                          <strong>{item.display}</strong>
                          <span>{item.occurrences ?? 1} geçiş</span>
                        </article>
                      ))}
                    </Panel>

                    <Panel title="Çözümlenemeyen Dipnot Atıfları" empty="Tüm dipnot atıfları başarıyla çözümlendi.">
                      {unresolvedFootnote.map((item) => (
                        <article className="row warn-row" key={`footnote-${item.id}`}>
                          <strong>Dipnot {item.id}</strong>
                          <span className="unresolved-text">{item.text}</span>
                        </article>
                      ))}
                    </Panel>
                  </>
                )}
              </section>
            )}
          </>
        )}

        {/* --- SECTION 2: ONLINE VERIFICATION TAB (REFERANSCHECK CLONE) --- */}
        {isOnline && (
          <div style={{ marginTop: 16 }}>
            {onlineStatus === 'idle' && (
              <>
                <section className="hero">
                  <div className="hero-content">
                    <h1 className="animate-in">
                      Yapay Zekâya Yaptırılmış Sahte Atıflara Güvenmeyin!
                    </h1>
                    <p className="animate-in delay-1">
                      Kaynakça referanslarınızı tespit edip uluslararası akademik veritabanlarında arayalım.
                      PDF, DOCX veya TXT dosyalarınızı yükleyin veya doğrudan kaynakça listesini yapıştırın.
                    </p>
                  </div>
                </section>

                {onlineError && (
                  <div className="error-notice">
                    <div className="error-notice-inner">
                      <AlertTriangle size={20} />
                      {onlineError}
                    </div>
                  </div>
                )}

                <FileUpload onSubmit={handleOnlineSubmit} isLoading={false} />

                <section className="databases-section">
                  <h2>Sorgulanan Akademik Veritabanları</h2>
                  <div className="database-badges">
                    <span className="db-badge">OpenAlex</span>
                    <span className="db-badge">Crossref</span>
                    <span className="db-badge">Semantic Scholar</span>
                  </div>
                </section>

                <FAQ />
              </>
            )}

            {onlineStatus === 'verifying' && (
              <div className="loading-overlay" style={{ position: 'relative', minHeight: 300, display: 'grid', placeItems: 'center' }}>
                <div className="loading-card" style={{ maxWidth: 500, width: '100%' }}>
                  <div className="spinner" />
                  <h3>Akademik Veritabanları Sorgulanıyor...</h3>
                  <p>Referanslar OpenAlex, Crossref ve Semantic Scholar üzerinde aranıyor.</p>
                  {onlineProgress.total > 0 && (
                    <>
                      <div className="progress-bar" style={{ height: 10, background: 'var(--border-light)', borderRadius: 5, overflow: 'hidden', margin: '16px 0' }}>
                        <div
                          className="progress-fill"
                          style={{
                            height: '100%',
                            background: 'var(--gradient-accent)',
                            width: `${Math.round((onlineProgress.done / onlineProgress.total) * 100)}%`,
                            transition: 'width var(--transition-fast)'
                          }}
                        />
                      </div>
                      <small style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Doğrulanıyor: {onlineProgress.done} / {onlineProgress.total} (%{Math.round((onlineProgress.done / onlineProgress.total) * 100)})
                      </small>
                    </>
                  )}
                </div>
              </div>
            )}

            {onlineStatus === 'ready' && (
              <div className="report-page animate-in">
                <div className="report-header">
                  <button className="btn btn-secondary btn-sm" onClick={handleOnlineGoBack} style={{ marginBottom: 16 }}>
                    ← Yeni Kontrol
                  </button>
                  <h1>Çevrimiçi Referans Doğrulama Raporu</h1>
                  <p>{onlineFileName || 'Metin Girişi'} • {new Date().toLocaleDateString('tr-TR')}</p>
                </div>

                {/* Verification Rate */}
                <div className="verification-bar-wrapper">
                  <div className="verification-bar-header">
                    <h3>Doğrulama Oranı</h3>
                    <span className="verification-rate">%{onlineStats.rate}</span>
                  </div>
                  <div className="verification-bar">
                    <div
                      className="verification-bar-fill"
                      style={{ width: `${onlineStats.rate}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="stats-row">
                  <div className="stat-card">
                    <div className="stat-icon blue"><FileText size={20} /></div>
                    <div className="stat-info">
                      <strong>{onlineStats.total}</strong>
                      <span>Toplam Referans</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon green"><CheckCircle2 size={20} /></div>
                    <div className="stat-info">
                      <strong>{onlineStats.found}</strong>
                      <span>Doğrulanan</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon orange"><AlertTriangle size={20} /></div>
                    <div className="stat-info">
                      <strong>{onlineStats.notFound}</strong>
                      <span>Bulunamayan</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon blue"><Search size={20} /></div>
                    <div className="stat-info">
                      <strong>{onlineStats.highConfidence}</strong>
                      <span>Yüksek Güven</span>
                    </div>
                  </div>
                </div>

                {/* Source Distribution */}
                {Object.keys(onlineStats.sourceDistribution).length > 0 && (
                  <div className="source-distribution">
                    <h3>Kaynak Veritabanı Dağılımı</h3>
                    <div className="database-badges" style={{ justifyContent: 'flex-start' }}>
                      {Object.entries(onlineStats.sourceDistribution).map(([source, count]) => (
                        <span key={source} className="db-badge">
                          {source}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Export */}
                <div className="export-bar" style={{ margin: '16px 0', display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleDownloadOnlineReport}>
                    <Download size={16} /> Rapor İndir (TXT)
                  </button>
                </div>

                {/* Filter */}
                <div className="filter-row">
                  <button
                    className={`filter-btn ${onlineFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setOnlineFilter('all')}
                  >
                    Tümü <span className="filter-count">{onlineStats.total}</span>
                  </button>
                  <button
                    className={`filter-btn ${onlineFilter === 'found' ? 'active' : ''}`}
                    onClick={() => setOnlineFilter('found')}
                  >
                    Doğrulanan <span className="filter-count">{onlineStats.found}</span>
                  </button>
                  <button
                    className={`filter-btn ${onlineFilter === 'not-found' ? 'active' : ''}`}
                    onClick={() => setOnlineFilter('not-found')}
                  >
                    Bulunamayan <span className="filter-count">{onlineStats.notFound}</span>
                  </button>
                </div>

                {/* Reference Cards */}
                <div className="references-list" style={{ marginTop: 20 }}>
                  {filteredOnlineResults.map((result) => (
                    <ReferenceCard key={result.id} result={result} />
                  ))}
                  {filteredOnlineResults.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                      Bu filtreyle eşleşen referans bulunamadı.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <footer className="footer" style={{ marginTop: 64 }}>
          <div className="footer-inner">
            <div className="footer-brand">
              <span className="logo-icon">RC</span>
              <span>Referans Kontrol</span>
            </div>
            <div className="footer-links">
              <a href="#/">Gizlilik</a>
              <a href="#/">İletişim</a>
            </div>
          </div>
          <p className="footer-copy">
            2026 Referans Kontrol. Akademik Referans Doğrulama Aracı.
          </p>
        </footer>
      </main>
    </>
  );
}

function formatParagraphs(item) {
  return item.paragraphs?.join(", ") ?? item.paragraphIndex + 1;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Metric({ icon, label, value, tone = "" }) {
  return (
    <article className={`metric ${tone}`}>
      {React.cloneElement(icon, { size: 24 })}
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Panel({ title, empty, children }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="list">{items.length ? items : <p className="empty">{empty}</p>}</div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
