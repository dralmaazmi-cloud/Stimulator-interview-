import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const OUT = process.env.OUT || new URL('./shots', import.meta.url).pathname;
const MAX_FULL_BOOK_PAGES = Number(process.env.MAX_FULL_BOOK_PAGES || 150);
const countPdfPages = buffer => (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], locale: 'ar-AE' });
const page = await context.newPage();
await page.addInitScript(() => { window.print = () => {}; });
await page.goto(`${BASE}/#/preparation`);
await page.waitForSelector('.preparation-overview');
await page.locator('button:has-text("تصدير PDF")').click();
await page.waitForSelector('#app-dialog[open] .print-scope-option');
await page.locator('#app-dialog .print-scope-option:has-text("دليل التحضير كاملًا")').click();
await page.waitForSelector('#print-book-root .print-book');

const questions = await page.locator('#print-book-root .print-question-page').count();
const answers = await page.locator('#print-book-root .print-model-answer').count();
await page.emulateMedia({ media: 'print' });
const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
const pages = countPdfPages(pdf);
fs.writeFileSync(`${OUT}/preparation-book-alpha-10.pdf`, pdf);

console.log(`[BOOK PDF] pages=${pages} questions=${questions} answers=${answers} bytes=${pdf.length}`);
if (questions !== 70 || answers !== 70) {
  throw new Error(`Expected 70 questions and answers, received ${questions}/${answers}`);
}
if (pages > MAX_FULL_BOOK_PAGES) {
  throw new Error(`Full preparation book is ${pages} pages; maximum accepted is ${MAX_FULL_BOOK_PAGES}`);
}

await browser.close();
