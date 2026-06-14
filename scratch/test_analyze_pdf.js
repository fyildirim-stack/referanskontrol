import fs from 'fs';
import { analyzePdf } from '../src/wordProcessor.js';

async function run() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\10.55918-islammedeniyetidergisi.1631526-4572206.pdf";
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const result = await analyzePdf(fileBuffer);
    
    console.log("=== CITATIONS ===");
    console.log(`Total: ${result.citations.length}`);
    result.citations.forEach((c) => {
      console.log(`- Page ${c.pageNumber} | Display: "${c.display}" | Keys: [${c.keys.join(', ')}]`);
    });

    console.log("\n=== REFERENCES ===");
    console.log(`Total: ${result.references.length}`);
    result.references.forEach((r) => {
      console.log(`- Index: ${r.paragraphIndex} | Keys: [${r.keys.join(', ')}] | Raw: "${r.display.slice(0, 100)}..."`);
    });

    console.log("\n=== MISSING UNIQUE ===");
    console.log(`Total: ${result.missingUnique.length}`);
    result.missingUnique.forEach((m) => {
      console.log(`- Display: "${m.display}" | Keys: [${m.keys.join(', ')}] | Paragraphs/Pages: ${m.paragraphs.join(', ')}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
