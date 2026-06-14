import { test } from 'vitest';
import fs from 'fs';
import { readPdfFile, parsePdfBibliography } from './pdfParser.js';
import { parseReferences } from './services/referenceParser.js';

test('print OECD references from full analysis', async () => {
  const filePath = "C:\\\\Users\\\\Fatih YILDIRIM\\\\Downloads\\\\10.17244-eku.1750481-5089233.pdf";
  const fileBuffer = fs.readFileSync(filePath);
  const text = await readPdfFile(fileBuffer);
  const bib = parsePdfBibliography(text);
  
  if (!bib) {
    console.log("No bibliography found!");
    return;
  }
  
  console.log("=== EXTRACTED BIBLIOGRAPHY TEXT ===");
  console.log(bib);
  
  const refs = parseReferences(bib);
  console.log("\\n=== PARSED REFERENCES ===");
  refs.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.authors.join(', ')} (${r.year})] ${r.title.substring(0, 50)}...`);
  });
});
