import fs from 'fs';
import { readPdfFile, parsePdfBibliography } from './src/pdfParser.js';

async function test() {
  try {
    const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\10.17244-eku.1750481-5089233.pdf";
    const fileBuffer = fs.readFileSync(filePath);
    const text = await readPdfFile(fileBuffer);
    const bib = parsePdfBibliography(text);
    if (!bib) {
      console.log("No bibliography found!");
    } else {
      console.log("=== BIBLIOGRAPHY START ===");
      console.log(bib.substring(0, 1000));
      console.log("=== BIBLIOGRAPHY END ===");
    }
  } catch (e) {
    console.error(e);
  }
}
test();
