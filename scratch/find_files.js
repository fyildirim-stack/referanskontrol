import fs from 'fs';
import path from 'path';

const dirs = [
  "C:\\Users\\Fatih YILDIRIM\\Desktop",
  "C:\\Users\\Fatih YILDIRIM\\Downloads"
];

dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    if (file.includes("1964828")) {
      console.log(`Found: ${path.join(dir, file)}`);
    }
  });
});
