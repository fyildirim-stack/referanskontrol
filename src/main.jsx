import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileCheck2, FileJson, FileText, Search, UploadCloud } from "lucide-react";
import { analyzeDocx, convertDocxToFootnotes } from "./wordProcessor.js";
import { exportBibtex, exportCslJson, exportRis } from "./zoteroExport.js";
import "./styles.css";

function App() {
  const [activeTab, setActiveTab] = useState("in-text"); // "in-text" or "footnote"

  // Metin İçi Atıf Page States
  const [inTextFile, setInTextFile] = useState(null);
  const [inTextStatus, setInTextStatus] = useState("idle");
  const [inTextAnalysis, setInTextAnalysis] = useState(null);
  const [inTextConvertedBlob, setInTextConvertedBlob] = useState(null);
  const [inTextError, setInTextError] = useState("");
  const [inTextApprovedIds, setInTextApprovedIds] = useState(new Set());

  // Dipnotlu Atıf Page States
  const [footnoteFile, setFootnoteFile] = useState(null);
  const [footnoteStatus, setFootnoteStatus] = useState("idle");
  const [footnoteAnalysis, setFootnoteAnalysis] = useState(null);
  const [footnoteError, setFootnoteError] = useState("");
  const [footnoteApprovedIds, setFootnoteApprovedIds] = useState(new Set());

  // Active States selector based on activeTab
  const isInText = activeTab === "in-text";

  const file = isInText ? inTextFile : footnoteFile;
  const status = isInText ? inTextStatus : footnoteStatus;
  const analysis = isInText ? inTextAnalysis : footnoteAnalysis;
  const error = isInText ? inTextError : footnoteError;
  const approvedIds = isInText ? inTextApprovedIds : footnoteApprovedIds;
  const setApprovedIds = isInText ? setInTextApprovedIds : setFootnoteApprovedIds;
  const convertedBlob = isInText ? inTextConvertedBlob : null;

  const fileName = file?.name ?? "";
  const uniqueMissing = isInText ? (analysis?.missingUnique ?? []) : [];
  const missingFootnoteUnique = !isInText ? (analysis?.missingFootnoteUnique ?? []) : [];
  const unresolvedFootnote = !isInText ? (analysis?.unresolvedFootnoteCitations ?? []) : [];
  const verificationRecords = analysis?.verificationRecords ?? [];
  const approvedRecords = verificationRecords.filter((record) => approvedIds.has(record.id));

  async function handleFile(nextFile) {
    if (!nextFile) return;

    if (isInText) {
      setInTextFile(nextFile);
      setInTextStatus("analyzing");
      setInTextAnalysis(null);
      setInTextConvertedBlob(null);
      setInTextApprovedIds(new Set());
      setInTextError("");

      try {
        const result = await analyzeDocx(nextFile);
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
        const result = await analyzeDocx(nextFile);
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

  function toggleApproved(id) {
    setApprovedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadReport() {
    if (!analysis) return;
    let lines = [];
    if (isInText) {
      lines = [
        "APA Metin İçi Atıf Denetim Raporu",
        `Dosya: ${fileName}`,
        `Tarih: ${new Date().toLocaleString("tr-TR")}`,
        "",
        `Metin içi atıf: ${analysis.citations.length}`,
        `Kaynakça girdisi: ${analysis.references.length}`,
        `Kaynakçada bulunmayan tekil kaynak: ${uniqueMissing.length}`,
        `Kaynakçada bulunmayan atıf geçişi: ${analysis.missing.length}`,
        `Zotero için onaylanan kaynak: ${approvedRecords.length}`,
        "",
        "Kaynakçada bulunmayan tekil kaynaklar:",
        ...uniqueMissing.map((item) => `- ${item.display} | ${item.occurrences ?? 1} geçiş | paragraf ${formatParagraphs(item)}`),
        "",
        "Kaynak doğrulama kayıtları:",
        ...verificationRecords.map((item) => `- ${item.title} | ${item.author} | ${item.year} | ${item.status}`),
      ];
      downloadBlob(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), "apa-metin-ici-atif-denetim-raporu.txt");
    } else {
      lines = [
        "İSNAD/Chicago Dipnotlu Atıf Denetim Raporu",
        `Dosya: ${fileName}`,
        `Tarih: ${new Date().toLocaleString("tr-TR")}`,
        "",
        `Dipnot atfı: ${analysis.footnoteCitations?.length ?? 0}`,
        `Kaynakça girdisi: ${analysis.references.length}`,
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
        ...verificationRecords.map((item) => `- ${item.title} | ${item.author} | ${item.year} | ${item.status}`),
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

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <h1>Referans Kontrol</h1>
          <p>
            {isInText
              ? "Word belgesindeki metin içi atıfları (APA stili) kaynakçayla karşılaştırır. Metin içi atıfları dipnota dönüştürebilir."
              : "Word belgesindeki dipnot atıflarını (İSNAD/Chicago stili) kaynakçayla karşılaştırır. Kısaltmalı atıfları çözümler ve eksik kaynakları raporlar."}
          </p>
        </div>
        <span className="privacy">v0.4.0</span>
      </section>

      {/* Pages/Tabs Selector */}
      <nav className="tab-bar">
        <button
          type="button"
          className={`tab-button ${isInText ? "active" : ""}`}
          onClick={() => setActiveTab("in-text")}
        >
          <Search size={16} />
          Metin İçi Atıf Kontrolü
        </button>
        <button
          type="button"
          className={`tab-button ${!isInText ? "active" : ""}`}
          onClick={() => setActiveTab("footnote")}
        >
          <FileText size={16} />
          Dipnotlu Atıf Kontrolü
        </button>
      </nav>

      <section className="workspace">
        <label className="dropzone">
          <input type="file" accept=".docx" onChange={(event) => handleFile(event.target.files?.[0])} />
          <UploadCloud size={42} />
          <strong>{fileName || "Word belgesini seçin"}</strong>
          <span>
            {isInText
              ? "Kaynakça başlığı “Kaynakça”, “Kaynaklar” veya “References” olarak ayrılmış olmalı. Metin içi atıflar analiz edilecektir."
              : "Kaynakça başlığı “Kaynakça”, “Kaynaklar” veya “References” olarak ayrılmış olmalı. Dipnot atıfları analiz edilecektir."}
          </span>
        </label>

        <div className="actions">
          {isInText ? (
            <>
              <button type="button" onClick={handleConvert} disabled={!analysis || status === "converting"}>
                <FileCheck2 size={18} />
                Dipnotlu Word oluştur
              </button>
              <button type="button" className="secondary" onClick={downloadReport} disabled={!analysis}>
                <Download size={18} />
                Rapor indir
              </button>
              <button type="button" className="secondary" onClick={downloadConverted} disabled={!convertedBlob}>
                <FileText size={18} />
                Word indir
              </button>
            </>
          ) : (
            <button type="button" onClick={downloadReport} disabled={!analysis}>
              <Download size={18} />
              Rapor indir
            </button>
          )}
        </div>

        {status !== "idle" && (
          <div className={`notice ${status === "error" ? "bad" : ""}`}>
            {status === "analyzing" && "Belge analiz ediliyor..."}
            {status === "ready" &&
              (isInText
                ? "Metin içi atıf analizi tamamlandı. Kaynak doğrulama ve Zotero export kayıtları oluşturuldu."
                : "Dipnotlu atıf analizi tamamlandı. Kaynak doğrulama ve Zotero export kayıtları oluşturuldu.")}
            {status === "converting" && "Word dosyası İSNAD dipnot formatına dönüştürülüyor..."}
            {status === "converted" && "Dipnotlu Word dosyası hazır."}
            {status === "error" && error}
          </div>
        )}
      </section>

      {analysis && (
        <section className="results">
          {isInText ? (
            <>
              <Metric icon={<Search />} label="Metin içi atıf" value={analysis.citations.length} />
              <Metric icon={<FileText />} label="Kaynakça girdisi" value={analysis.references.length} />
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
              <Metric icon={<FileText />} label="Dipnot atfı" value={analysis.footnoteCitations?.length ?? 0} />
              <Metric icon={<FileText />} label="Kaynakça girdisi" value={analysis.references.length} />
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

      {analysis && (
        <section className="verification-panel">
          <div className="panel-head">
            <div>
              <h2>Kaynak Doğrulama ve Zotero Export</h2>
              <p>Google bağlantısı aday eşleşmeyi kullanıcıya açar. Onaylanan kayıtlar CSL-JSON, RIS veya BibTeX olarak indirilebilir.</p>
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
                  <input type="checkbox" checked={approvedIds.has(record.id)} onChange={() => toggleApproved(record.id)} />
                  <span>✓ Onayla</span>
                </label>
                <div className="source-main">
                  <strong>{record.title}</strong>
                  <span>{[record.author, record.year, record.type].filter(Boolean).join(" | ")}</span>
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

      {analysis && (
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
                {analysis.citations.slice(0, 80).map((item) => (
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

      <section className="note">
        <AlertTriangle size={18} />
        <p>Google bağlantıları kullanıcı tetiklidir; otomatik kazıma yapılmaz. Zotero export dosyaları onaylanan kayıtları, hiç onay yoksa tüm ayrıştırılmış kaynakları içerir. Çözümlenemeyen dipnot atıfları manuel inceleme gerektirir.</p>
      </section>
    </main>
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
