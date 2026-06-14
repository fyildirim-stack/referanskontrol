/**
 * Report Generator - Generate downloadable reports from verification results
 */

/**
 * Generate a text report from verification results
 * @param {object[]} results - Verification results
 * @param {string} fileName - Original file name
 * @returns {string} Report text
 */
export function generateTextReport(results, fileName) {
  const found = results.filter(r => r.found);
  const notFound = results.filter(r => !r.found);
  const rate = results.length > 0 ? Math.round((found.length / results.length) * 100) : 0;

  const lines = [
    '═══════════════════════════════════════════════════════',
    '           REFERANS DOĞRULAMA RAPORU',
    '═══════════════════════════════════════════════════════',
    '',
    `Dosya: ${fileName || 'Metin girişi'}`,
    `Tarih: ${new Date().toLocaleString('tr-TR')}`,
    `Platform: Referans Kontrol v1.0.0`,
    '',
    '───────────────────────────────────────────────────────',
    '                    ÖZET',
    '───────────────────────────────────────────────────────',
    '',
    `Toplam referans: ${results.length}`,
    `Doğrulanan: ${found.length}`,
    `Bulunamayan: ${notFound.length}`,
    `Doğrulama oranı: %${rate}`,
    '',
  ];

  if (found.length > 0) {
    lines.push(
      '───────────────────────────────────────────────────────',
      '              DOĞRULANAN REFERANSLAR',
      '───────────────────────────────────────────────────────',
      ''
    );

    found.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.originalText}`);
      if (r.match) {
        lines.push(`   ✅ Kaynak: ${r.match.source} | Skor: ${r.match.score}/100`);
        if (r.match.doi) lines.push(`   DOI: ${r.match.doi}`);
        if (r.match.url) lines.push(`   URL: ${r.match.url}`);
      }
      lines.push('');
    });
  }

  if (notFound.length > 0) {
    lines.push(
      '───────────────────────────────────────────────────────',
      '              BULUNAMAYAN REFERANSLAR',
      '───────────────────────────────────────────────────────',
      ''
    );

    notFound.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.originalText}`);
      lines.push(`   ⚠️ Akademik veritabanlarında doğrulanamadı`);
      if (r.parsed.authors?.length) lines.push(`   Yazar: ${r.parsed.authors.join(', ')}`);
      if (r.parsed.year) lines.push(`   Yıl: ${r.parsed.year}`);
      lines.push('');
    });
  }

  lines.push(
    '═══════════════════════════════════════════════════════',
    'Bu rapor Referans Kontrol tarafından otomatik oluşturulmuştur.',
    'OpenAlex, Crossref ve Semantic Scholar veritabanları kullanılmıştır.',
    '═══════════════════════════════════════════════════════',
  );

  return lines.join('\n');
}

/**
 * Calculate statistics from verification results
 * @param {object[]} results
 * @returns {object}
 */
export function calculateStats(results) {
  const found = results.filter(r => r.found);
  const notFound = results.filter(r => !r.found);

  // Source distribution
  const sourceMap = {};
  found.forEach(r => {
    if (r.match?.source) {
      sourceMap[r.match.source] = (sourceMap[r.match.source] || 0) + 1;
    }
  });

  return {
    total: results.length,
    found: found.length,
    notFound: notFound.length,
    rate: results.length > 0 ? Math.round((found.length / results.length) * 100) : 0,
    sourceDistribution: sourceMap,
    highConfidence: found.filter(r => r.matchDetails?.confidence === 'high').length,
    mediumConfidence: found.filter(r => r.matchDetails?.confidence === 'medium').length,
    lowConfidence: found.filter(r => r.matchDetails?.confidence === 'low').length,
  };
}
