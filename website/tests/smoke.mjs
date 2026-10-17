// Smoke test for the standalone 3D site. Requires `npm run dev` (or BASE_URL) and Chrome via Playwright.
// FULL_WALKTHROUGH=1 waits for the complete 58-second guided sequence.
import { chromium } from "playwright";
const base = process.env.BASE_URL ?? "http://localhost:5173";
const full = process.env.FULL_WALKTHROUGH === "1";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
await page.getByRole("heading", { level: 1 }).waitFor();
if (!(await page.getByText("Buy with").count())) throw new Error("hero missing");
await page.getByRole("button", { name: "Skip transition" }).click();
await page.getByRole("button", { name: "Exit experience" }).waitFor({ timeout: 15000 });
await page.getByRole("button", { name: "Cloudy lemonade" }).click();
await page.getByRole("button", { name: "Add to cart" }).waitFor({ timeout: 5000 });
await page.getByRole("tab", { name: "Nutrition" }).click();
await page.getByText("22 g per serving").waitFor();
await page.getByRole("button", { name: "Add to cart" }).click();
await page.getByText("1 · $4.50").waitFor();
await page.getByRole("button", { name: "List · 2" }).click();
await page.getByRole("button", { name: "Find next item" }).click();
await page.getByText(/Heading to aisle/).waitFor({ timeout: 5000 });
if (full) {
  await page.getByRole("button", { name: "Restart" }).click();
  await page.getByText("A good little haul.").waitFor({ timeout: 70000 });
  console.log("full walkthrough reached the summary");
} else {
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByText("A good little haul.").waitFor();
}
if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
console.log("smoke ok");
await browser.close();
