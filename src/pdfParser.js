import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

// Avoid worker loading errors in Node (e.g. during Vitest tests)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export async function extractTextFromPdf(file) {
  let arrayBuffer;
  if (file instanceof ArrayBuffer) {
    arrayBuffer = file;
  } else if (file instanceof Blob) {
    arrayBuffer = await file.arrayBuffer();
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) {
    arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  } else if (file.buffer && file.buffer instanceof ArrayBuffer) {
    arrayBuffer = file.buffer;
  } else {
    throw new Error("Geçersiz dosya formatı.");
  }

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;
    
    // Group text items by vertical coordinate (line)
    const linesMap = new Map();
    items.forEach((item) => {
      if (!item.str || item.str.trim() === "") return;
      const y = Math.round(item.transform[5]); // y coordinate is transform[5]
      
      let foundY = null;
      for (const existingY of linesMap.keys()) {
        if (Math.abs(existingY - y) < 4) { // 4 units threshold for same line
          foundY = existingY;
          break;
        }
      }
      if (foundY !== null) {
        linesMap.get(foundY).push(item);
      } else {
        linesMap.set(y, [item]);
      }
    });

    // Sort lines from top to bottom (y descending in PDF coordinate space)
    const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const pageLines = sortedY.map((y) => {
      const lineItems = linesMap.get(y);
      // Sort items in a line from left to right (x ascending, x is transform[4])
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
      return lineItems.map((item) => item.str).join(" ");
    });

    pages.push({
      pageNumber: i,
      lines: pageLines,
    });
  }

  return pages;
}

// PDF parsing helper module
