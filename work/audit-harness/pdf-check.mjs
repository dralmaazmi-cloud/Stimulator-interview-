// alpha-5 (R4): quick PDF check from the live answer report («تصدير PDF» path) — prints to A4 and counts pages.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4173';
const OUT = process.env.OUT || new URL('./shots', import.meta.url).pathname;
const ANSWER = 'في بداية المشروع كان الفريق متأخرًا عن الجدول. كانت مهمتي إعادة توزيع العمل بين الأعضاء. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي وتابعت التنفيذ يوميًا. اكتمل المشروع في الموعد المحدد. تعلمت أن المتابعة المبكرة تمنع التأخير.';
const countPdfPages = buffer => (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
const browser = await chromium.launch();
for (const [label, qid, suffix] of [['star-l', 'C1-B3', ''], ['star-l-low', 'C1-B3', ' LOWSCORE'], ['seal', 'C1-S1', ''], ['mission', 'M1-S1', '']]) {
  const context = await browser.newContext({ ...devices['iPhone 14'], locale: 'ar-AE' });
  const page = await context.newPage();
  await page.goto(`${BASE}/#/simulation?question=${qid}&answer=text`);
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER + suffix + ' NOFOLLOWUP');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').dispatchEvent('click');
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(`${OUT}/pdf-check-${label}.pdf`, pdf);
  console.log(`[PDF ${label}] pages=${countPdfPages(pdf)} bytes=${pdf.length}`);
  await context.close();
}
await browser.close();
