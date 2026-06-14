import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import { analyzeDocx } from '../src/wordProcessor.js';

globalThis.DOMParser = DOMParser;

async function run() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\1964828-AF-T0-V0-20260605164711 (1).docx";
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const result = await analyzeDocx(fileBuffer);
    
    console.log(`Total missing unique footnotes: ${result.missingFootnoteUnique.length}`);
    result.missingFootnoteUnique.forEach((m, idx) => {
      console.log(`${idx + 1}: display: "${m.display}" | keys: [${m.keys.join(', ')}]`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
