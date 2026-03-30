import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error("Usage: npm run qr -- https://your-deployed-url.example");
  process.exit(1);
}

let parsedUrl;

try {
  parsedUrl = new URL(targetUrl);
} catch (error) {
  console.error("Please provide a valid full URL, including https://");
  process.exit(1);
}

const qrApiUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
qrApiUrl.searchParams.set("size", "768x768");
qrApiUrl.searchParams.set("format", "svg");
qrApiUrl.searchParams.set("margin", "20");
qrApiUrl.searchParams.set("data", parsedUrl.toString());

const response = await fetch(qrApiUrl);

if (!response.ok) {
  console.error(`QR generation failed with status ${response.status}.`);
  process.exit(1);
}

const svg = await response.text();
const outputDir = join(process.cwd(), "assets");
const outputPath = join(outputDir, "journey-map-qr.svg");

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, svg, "utf8");

console.log(`Saved QR code to ${outputPath}`);
