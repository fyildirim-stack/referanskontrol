import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import { analyzeDocx } from '../src/wordProcessor.js';

globalThis.DOMParser = DOMParser;

async function run() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\1964828-AF-T0-V0-20260605164711 (1).docx";
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const result = await analyzeDocx(fileBuffer);
    
    let output = "";
    const log = (msg) => { output += msg + "\n"; };
    log(`Total footnote citations: ${result.footnoteCitations.length}`);
    log(`Missing footnote citations: ${result.missingFootnoteCitations.length}`);
    log(`Unresolved footnote citations: ${result.unresolvedFootnoteCitations.length}`);
    
    log("\n=== ALL FOOTNOTE CITATIONS ===");
    result.footnoteCitations.forEach((fc) => {
      log(`ID: ${fc.id} | Kind: ${fc.kind}`);
      log(`Text: "${fc.text}"`);
      log(`Keys: [${fc.keys.join(', ')}]`);
      log("---------------------------------------");
    });
    fs.writeFileSync("scratch/footnotes_output_utf8.txt", output, "utf-8");
    console.log("Written successfully");
  } catch (err) {
    console.error(err);
  }
}

run();
