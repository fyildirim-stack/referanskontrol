import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import { analyzeDocx } from '../src/wordProcessor.js';

globalThis.DOMParser = DOMParser;

async function run() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\1964828-AF-T0-V0-20260605164711 (1).docx";
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const result = await analyzeDocx(fileBuffer);
    
    console.log("=== DIAGNOSTICS ===");
    console.log(JSON.stringify(result.diagnostics, null, 2));
    
    console.log("\n=== REFERENCE KEYS ===");
    const refKeys = [];
    result.references.forEach((ref, idx) => {
      console.log(`${idx + 1}: Keys: [${ref.keys.join(', ')}] | Display: ${ref.display}`);
      refKeys.push(...ref.keys);
    });
    
    const refKeysSet = new Set(refKeys);
    
    console.log("\n=== MISSING FOOTNOTE CITATIONS ===");
    result.missingFootnoteUnique.forEach((fc, idx) => {
      console.log(`${idx + 1}: Display: ${fc.display}`);
      console.log(`   Keys: [${fc.keys.join(', ')}]`);
      fc.keys.forEach((key) => {
        console.log(`   Key "${key}" in referenceKeys? ${refKeysSet.has(key)}`);
      });
    });
  } catch (err) {
    console.error(err);
  }
}

run();
