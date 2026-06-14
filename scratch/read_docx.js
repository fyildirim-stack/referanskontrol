import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import {
  readZipText,
  parseXml,
  extractParagraphs,
  normalizeVisibleText
} from '../src/docxParser.js';

// Polyfill DOMParser
globalThis.DOMParser = DOMParser;

function isReferencesHeading(text) {
  const normalized = normalizeVisibleText(text).replace(/^[\dIVXLC]+\s*[.)-]\s*/i, "").replace(/[:：]\s*$/, "");
  return /^(kaynak(?:ça|ca)|kaynaklar|references?|reference list|bibliography)(?:\s*[/,-]\s*(kaynak(?:ça|ca)|kaynaklar|references?|bibliography))?$/i.test(normalized);
}

async function run() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\1956119-AF-T0-V0-20260521084022.docx";
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);
    const documentXml = await readZipText(zip, "word/document.xml");
    const doc = parseXml(documentXml);
    const paragraphs = extractParagraphs(doc);
    const referencesStart = paragraphs.findIndex((paragraph) => isReferencesHeading(paragraph.text));
    
    console.log("referencesStart index:", referencesStart);
    if (referencesStart !== -1) {
      console.log("Heading text:", paragraphs[referencesStart].text);
      const bibParagraphs = paragraphs.slice(referencesStart + 1);
      console.log(`Found ${bibParagraphs.length} paragraphs in bibliography.`);
      const output = bibParagraphs.map((p, idx) => `${idx + 1}: [Index ${p.index}] ${p.text}`).join('\n');
      fs.writeFileSync('scratch/bib_paragraphs.txt', output);
      console.log("Written bibliography paragraphs to scratch/bib_paragraphs.txt");
    } else {
      console.log("References heading not found!");
    }
  } catch (err) {
    console.error(err);
  }
}

run();
