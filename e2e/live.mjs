// Read-only check of a deployed site with the sample data loaded. Changes nothing.
// Usage: BASE_URL=https://... SEED_LOGINS_FILE=/path/logins.json node live.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
const seed = JSON.parse(readFileSync(process.env.SEED_LOGINS_FILE, 'utf8'));
const login = (who) => seed.logins.find((l) => l.who.startsWith(who));
let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => { if (ok) { passed++; console.log(`ok   ${name}`); } else { failures.push(name); console.log(`FAIL ${name} ${detail}`); } };
const browser = await chromium.launch();
const settle = async (page) => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(200); };
async function signIn(email, password, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login') || u.search.includes('err=')), page.click('button[type=submit]')]);
  await settle(page);
  return { context, page };
}
const north = seed.clientIds.NORTH;
const sunrise = seed.clientIds.SUNR;
try {
  const staff = login('Office staff');
  let t0 = Date.now();
  const s = await signIn(staff.email, staff.password);
  check('office staff can sign in', new URL(s.page.url()).pathname === '/clients', s.page.url());
  console.log(`     sign-in took ${Date.now() - t0} ms`);
  await s.page.goto(`${BASE}/c/${north}/payroll`);
  await s.page.click('a:has-text("October 2026")');
  await s.page.waitForURL(/\/payroll\/[0-9a-f-]{36}$/);
  await settle(s.page);
  const runText = await s.page.locator('body').innerText();
  check('October payroll shows the hand-worked figures', runText.includes('41,386') && runText.includes('95,775'));
  check('sample-data banner is shown', runText.includes('Sample data for testing'));
  const octRun = s.page.url().split('/').pop();
  const lineHref = await s.page.locator('a:has-text("Payslip")').first().getAttribute('href');
  const pdf = await s.page.request.get(`${BASE}${lineHref}`);
  check('payslip PDF downloads', pdf.status() === 200 && (await pdf.body()).subarray(0, 5).toString() === '%PDF-');
  t0 = Date.now();
  await s.page.goto(`${BASE}/c/${sunrise}/employees`);
  await settle(s.page);
  console.log(`     employee list took ${Date.now() - t0} ms`);
  check('Sunrise shows 4 employees', (await s.page.locator('tbody tr').count()) === 4);
  await s.context.close();

  const hr = login('Client HR for Northfield');
  const h = await signIn(hr.email, hr.password);
  check('client HR lands on its own client', new URL(h.page.url()).pathname === `/c/${north}`);
  const r1 = await h.page.goto(`${BASE}/c/${sunrise}/employees`);
  check('client HR cannot open the other client', r1.status() === 404 || new URL(h.page.url()).pathname === `/c/${north}`);
  const r2 = await h.page.request.get(`${BASE}/api/register/${octRun}`);
  check('client HR cannot download the draft register', r2.status() === 404, `status ${r2.status()}`);
  await h.context.close();

  const emp = login('Employee');
  const e = await signIn(emp.email, emp.password, { width: 390, height: 800 });
  const et = await e.page.locator('body').innerText();
  check('employee sees own page with two payslips and a letter', new URL(e.page.url()).pathname === '/me' && et.includes('September 2026') && !et.includes('October 2026') && et.includes('Appointment letter'));
  const stranger = await e.page.request.get(`${BASE}${lineHref}`);
  check("employee cannot open someone else's draft payslip", stranger.status() === 404, `status ${stranger.status()}`);
  const doc = await e.page.locator('a:has-text("Open")').last().getAttribute('href');
  const letter = await e.page.request.get(`${BASE}${doc}`);
  check('employee can open the shared letter', letter.status() === 200);
  await e.context.close();

  const anon = await browser.newContext();
  const a = await anon.request.get(`${BASE}${lineHref}`, { maxRedirects: 0 });
  check('nobody signed out can fetch a payslip', a.status() !== 200, `status ${a.status()}`);
  const hdr = (await anon.request.get(`${BASE}/login`)).headers();
  check('security headers are set', hdr['x-frame-options'] === 'DENY' && hdr['x-content-type-options'] === 'nosniff');
} catch (err) {
  failures.push(String(err.message).split('\n')[0]);
  console.log(`FAIL ${String(err.message).split('\n')[0]}`);
}
await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
