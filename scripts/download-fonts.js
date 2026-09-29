/**
 * Downloads Inter font files for self-hosting.
 * Run once: node scripts/download-fonts.js
 * Requires internet access (build-time only, not runtime).
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const FONTS_DIR = path.join(__dirname, "../public/fonts");

if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// Inter from bunny.net (open source CDN) — use at build time only
const FONT_URLS = {
  "Inter-Regular.woff2":
    "https://fonts.bunny.net/inter/files/inter-latin-400-normal.woff2",
  "Inter-Medium.woff2":
    "https://fonts.bunny.net/inter/files/inter-latin-500-normal.woff2",
  "Inter-SemiBold.woff2":
    "https://fonts.bunny.net/inter/files/inter-latin-600-normal.woff2",
  "Inter-Bold.woff2":
    "https://fonts.bunny.net/inter/files/inter-latin-700-normal.woff2",
};

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

(async () => {
  for (const [filename, url] of Object.entries(FONT_URLS)) {
    const dest = path.join(FONTS_DIR, filename);
    if (fs.existsSync(dest)) {
      console.log(`  ✓ ${filename} already exists`);
      continue;
    }
    process.stdout.write(`  ↓ Downloading ${filename}... `);
    await download(url, dest);
    console.log("done");
  }
  console.log("\n✅ Fonts downloaded to public/fonts/");
})();
