import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import { analyzeDocx } from '../src/wordProcessor.js';

// Polyfill DOMParser
globalThis.DOMParser = DOMParser;

async function run() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\1956119-AF-T0-V0-20260521084022.docx";
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const result = await analyzeDocx(fileBuffer);
    
    console.log("=== MAIN ANALYZE DIAGNOSTICS ===");
    console.log(JSON.stringify(result.diagnostics, null, 2));
    
    if (result.diagnostics.unresolvedFootnoteCount === 0) {
      console.log("SUCCESS: 0 unresolved footnotes!");
    } else {
      console.log(`WARNING: ${result.diagnostics.unresolvedFootnoteCount} footnotes are still unresolved.`);
    }
  } catch (err) {
    console.error("Error analyzing docx using main codebase:", err);
  }
}

run();
