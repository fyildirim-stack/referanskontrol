import { test } from 'vitest';
import fs from 'fs';
import { analyzePdf } from './wordProcessor.js';

test('print OECD references from full analysis', async () => {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\10.25064-mulkiye.1809607-5356829.pdf";
  const fileBuffer = fs.readFileSync(filePath);
  const result = await analyzePdf(fileBuffer);
  
  console.log("=== OECD REFERENCES ===");
  result.references.forEach((r, idx) => {
    if (r.structured.raw.includes("OECD")) {
      console.log(`${idx}: Keys: [${r.keys.join(', ')}] | Raw: "${r.structured.raw}"`);
    }
  });
});
