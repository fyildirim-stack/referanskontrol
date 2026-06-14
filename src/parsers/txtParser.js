/**
 * TXT Parser - Extract bibliography from plain text files
 */

/**
 * Parse text content and extract bibliography section
 * @param {string} text - Full text content
 * @returns {string|null} Bibliography section text
 */
export function parseTxtBibliography(text) {
  if (!text || typeof text !== 'string') return null;

  // Search for bibliography header (supports optional markdown headings)
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

  // If no header found, check if the entire text looks like references
  const lines = text.split('\n').filter(l => l.trim());
  const looksLikeRefs = lines.filter(l =>
    /^\s*(?:\d+[\.\)]\s*)?[A-ZÇĞİÖŞÜ]/.test(l.trim()) &&
    /\(\d{4}\)|\b\d{4}\b/.test(l)
  ).length;

  if (looksLikeRefs >= lines.length * 0.5 && lines.length >= 2) {
    return text.trim();
  }

  return null;
}

/**
 * Read a text file and return its content
 * @param {File} file - File object
 * @returns {Promise<string>}
 */
export async function readTxtFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Metin dosyası okunamadı.'));
    reader.readAsText(file, 'UTF-8');
  });
}
