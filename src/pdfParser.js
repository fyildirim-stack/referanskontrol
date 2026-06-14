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
    const pageLines = [];
    for (const y of sortedY) {
      const lineItems = linesMap.get(y);
      // Sort items in a line from left to right (x ascending, x is transform[4])
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

      // Split into sub-lines if there's a large horizontal gap (column gutter)
      const subLines = [[]];
      for (let j = 0; j < lineItems.length; j++) {
        if (j > 0) {
          const prevItem = lineItems[j - 1];
          const prevEnd = prevItem.transform[4] + (prevItem.width || 0);
          const curStart = lineItems[j].transform[4];
          const gap = curStart - prevEnd;
          if (gap > 50) {
            // Large gap detected — start a new sub-line
            subLines.push([]);
          }
        }
        subLines[subLines.length - 1].push(lineItems[j]);
      }

      for (const subLineItems of subLines) {
        if (subLineItems.length === 0) continue;
        const minX = subLineItems[0].transform[4];
        const lastItem = subLineItems[subLineItems.length - 1];
        const maxX = lastItem.transform[4] + (lastItem.width || 0);
        pageLines.push({
          text: subLineItems.map((item) => item.str).join(" "),
          minX: minX,
          maxX: maxX,
          y: y
        });
      }
    }

    pages.push({
      pageNumber: i,
      lines: pageLines,
    });
  }

  return pages;
}

/**
 * Format extracted page lines into structured Markdown representation, similar to MarkItDown
 * Skips page numbers and running headers/footers, and formats headings and list items.
 * @param {object} page - Page object with lines
 * @returns {string} Markdown text for the page
 */
function formatPageToMarkdown(page) {
  const mdLines = [];
  const lines = page.lines;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text) continue;

    // Detect headings (all caps, or section numbers like "1. Introduction")
    const isHeading = 
      (text.length > 3 && text.length < 100 && text === text.toUpperCase() && !/^\d+$/.test(text)) ||
      (/^\d+(\.\d+)*\s+[A-ZÇĞİÖŞÜa-zçğıöşü]/.test(text) && text.length < 80) ||
      /^(Kaynakça|Kaynaklar|References|Bibliography|Referanslar)/i.test(text);

    // Detect and discard running headers/footers or page numbers
    const isFirstOrLast = i === 0 || i === lines.length - 1;
    const isPageNumber = /^\d+$/.test(text);
    const isHeaderFooter = isFirstOrLast && text.length < 25 && !isHeading;

    if (isPageNumber || isHeaderFooter) {
      continue; // Skip running headers, footers, and page numbers
    }

    if (isHeading) {
      mdLines.push(`\n## ${text}\n`);
      continue;
    }

    // Detect lists (bullet points or numbered lists)
    const isBulletList = /^[•⁃▪\-\*]\s+(.+)/.test(text);
    const isNumberedList = /^\d+[\.\)]\s+(.+)/.test(text);

    if (isBulletList) {
      mdLines.push(`- ${text.replace(/^[•⁃▪\-\*]\s+/, '')}`);
      continue;
    }

    if (isNumberedList) {
      mdLines.push(text);
      continue;
    }

    // Normal text line
    mdLines.push(text);
  }

  return mdLines.join('\n');
}

/**
 * Extract text content from a PDF file as a single string (in Markdown format)
 * @param {File|Blob|ArrayBuffer} file
 * @returns {Promise<string>}
 */
export async function readPdfFile(file) {
  const pages = await extractTextFromPdf(file);
  return pages
    .map(page => formatPageToMarkdown(page))
    .join('\n\n');
}

/**
 * Extract bibliography section from PDF text
 * @param {string} text - Full PDF text (supports Markdown format)
 * @returns {string|null}
 */
export function parsePdfBibliography(text) {
  if (!text) return null;

  const headerPatterns = [
    /(?:^|\n)\s*(?:#+\s*)?(Kaynakça|Kaynaklar|References|Bibliography|Referanslar)\s*\n/im,
  ];

  for (const pattern of headerPatterns) {
    const match = text.match(pattern);
    if (match) {
      const startIndex = match.index + match[0].length;
      const bibText = text.substring(startIndex).trim();
      if (bibText.length > 10) return bibText;
    }
  }

  return null;
}

