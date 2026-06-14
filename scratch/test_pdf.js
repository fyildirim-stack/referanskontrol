import fs from 'fs';
import { extractTextFromPdf } from '../src/pdfParser.js';

async function test() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\fatih-belediyesi-emlak-vergisi-bildirim-sureti-sorgu.pdf";
  try {
    console.log("Loading PDF file...");
    const data = fs.readFileSync(filePath);
    console.log("Extracting text from PDF...");
    const pages = await extractTextFromPdf(data);
    console.log(`Successfully extracted ${pages.length} pages:`);
    pages.forEach((page) => {
      console.log(`\n--- PAGE ${page.pageNumber} ---`);
      console.log(page.lines.slice(0, 10).join("\n"));
      if (page.lines.length > 10) {
        console.log("...");
      }
    });
  } catch (err) {
    console.error("Error during PDF parsing test:", err);
  }
}

test();
