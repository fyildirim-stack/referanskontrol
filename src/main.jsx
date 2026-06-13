import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileCheck2, FileJson, FileText, Search, UploadCloud } from "lucide-react";
import { analyzeDocx, convertDocxToFootnotes } from "./wordProcessor.js";
import { exportBibtex, exportCslJson, exportRis } from "./zoteroExport.js";
import "./styles.css";

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [analysis, setAnalysis] = useState(null);
  const [convertedBlob, setConvertedBlob] = useState(null);
  const [error, setError] = useState("");
  const [approvedIds, setApprovedIds] = useState(() => new Set());

  const fileName = useMemo(() => file?.name ?? "", [file]);
  const uniqueMissing = analysis?.missingUnique ?? analysis?.missing ?? [];
  const missingFootnoteUnique = analysis?.missingFootnoteUnique ?? [];
  const unresolvedFootnote = analysis?.unresolvedFootnoteCitations ?? [];
  const verificationRecords = analysis?.verificationRecords ?? [];
  const approvedRecords = verificationRecords.filter((record) => approvedIds.has(record.id));

  async function handleFile(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    setStatus("analyzing");
    setAnalysis(null);
    setConvertedBlob(null);
    setApprovedIds(new Set());
    setError("");

    try {
      const result = await analyzeDocx(nextFile);
      setAnalysis(result);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Belge okunamadı.");
    }
  }

  async function handleConvert() {
    if (!file || !analysis) return;
    setStatus("converting");
    setError("");

    try {
      const blob = await convertDocxToFootnotes(file, analysis);
      setConvertedBlob(blob);
      setStatus("converted");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Dönüştürme tamamlanamadı.");
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
    const lines = [
      "APA Atıf Denetim Raporu",
      `Dosya: ${fileName}`,
      `Tarih: ${new Date().toLocaleString("tr-TR")}`,
      "",
      `Metin içi atıf: ${analysis.citations.length}`,
      `Kaynakça girdisi: ${analysis.references.length}`,
      `Kaynakçada bulunmayan tekil kaynak: ${uniqueMissing.length}`,
      `Kaynakçada bulunmayan atıf geçişi: ${analysis.missing.length}`,
      `Dipnot atfı: ${analysis.footnoteCitations?.length ?? 0}`,
      `Kaynakçada bulunmayan tekil dipnot kaynağı: ${missingFootnoteUnique.length}`,
      `Çözümlenemeyen dipnot: ${unresolvedFootnote.length}`,
      `Zotero için onaylanan kaynak: ${approvedRecords.length}`,
      "",
      "Kaynakçada bulunmayan tekil kaynaklar:",
      ...uniqueMissing.map((item) => `- ${item.display} | ${item.occurrences ?? 1} geçiş | paragraf ${formatParagraphs(item)}`),
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
    downloadBlob(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), "apa-atif-denetim-raporu.txt");
  }

  function downloadConverted() {
    if (!convertedBlob || !file) return;
    downloadBlob(convertedBlob, file.name.replace(/\.docx$/i, "") + "-dipnotlu.docx");
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
          <p>Word belgesindeki metin içi ve dipnot atıflarını kaynakçayla karşılaştırır. APA ve Chicago/İSNAD stillerinde işlem yapabilir, İSNAD dipnot/kaynakça çıktısı üretir.</p>
        </div>
        <span className="privacy">v0.3.0</span>
      </section>

      <section className="workspace">
        <label className="dropzone">
          <input type="file" accept=".docx" onChange={(event) => handleFile(event.target.files?.[0])} />
          <UploadCloud size={42} />
          <strong>{fileName || "Word belgesini seçin"}</strong>
          <span>Kaynakça başlığı “Kaynakça”, “Kaynaklar” veya “References” olarak ayrılmış olmalı. Metin içi ve dipnot atıfları analiz edilecektir.</span>
        </label>

        <div className="actions">
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
        </div>

        {status !== "idle" && (
          <div className={`notice ${status === "error" ? "bad" : ""}`}>
            {status === "analyzing" && "Belge analiz ediliyor..."}
            {status === "ready" && "Analiz hazır. Kaynak doğrulama ve Zotero export kayıtları oluşturuldu."}
            {status === "converting" && "Word dosyası İSNAD dipnot formatına dönüştürülüyor..."}
            {status === "converted" && "Dipnotlu Word dosyası hazır."}
            {status === "error" && error}
          </div>
        )}
      </section>

      {analysis && (
        <section className="results">
          <Metric icon={<Search />} label="Metin içi atıf" value={analysis.citations.length} />
          <Metric icon={<FileText />} label="Kaynakça girdisi" value={analysis.references.length} />
          <Metric icon={<FileJson />} label="Zotero kaydı" value={verificationRecords.length} />
          <Metric icon={uniqueMissing.length ? <AlertTriangle /> : <CheckCircle2 />} label="Tekil eksik kaynak" value={uniqueMissing.length} tone={uniqueMissing.length ? "warn" : "ok"} />
          <Metric icon={<FileText />} label="Dipnot atfı" value={analysis.footnoteCitations?.length ?? 0} />
          <Metric icon={missingFootnoteUnique.length ? <AlertTriangle /> : <CheckCircle2 />} label="Tekil eksik dipnot" value={missingFootnoteUnique.length} tone={missingFootnoteUnique.length ? "warn" : "ok"} />
        </section>
      )}

      {analysis && (
        <section className="verification-panel">
          <div className="panel-head">
            <div>
              <h2>Kaynak Doğrulama ve Zotero Export</h2>
              <p>Scholar bağlantısı aday eşleşmeyi kullanıcıya açar. Onaylanan kayıtlar CSL-JSON, RIS veya BibTeX olarak indirilebilir.</p>
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
        </section>
      )}

      <section className="note">
        <AlertTriangle size={18} />
        <p>Google Scholar bağlantıları kullanıcı tetiklidir; otomatik kazıma yapılmaz. Zotero export dosyaları onaylanan kayıtları, hiç onay yoksa tüm ayrıştırılmış kaynakları içerir. Çözümlenemeyen dipnot atıfları manuel inceleme gerektirir.</p>
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
