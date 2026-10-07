// End-to-end check of the running app in a real browser.
// Usage: BASE_URL=http://localhost:3000 SEED_LOGINS_FILE=/path/logins.json node run.mjs
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const seed = JSON.parse(readFileSync(process.env.SEED_LOGINS_FILE, 'utf8'));
const login = (who) => seed.logins.find((l) => l.who.startsWith(who));
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`ok   ${name}`); }
  else { failures.push(name); console.log(`FAIL ${name} ${detail}`); }
}
async function step(name, fn) {
  try { await fn(); } catch (err) { failures.push(name); console.log(`FAIL ${name}: ${String(err.message).split('\n')[0]}`); }
}

const browser = await chromium.launch();
async function session(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => { failures.push(`page error: ${e.message}`); console.log(`FAIL page error: ${e.message}`); });
  return { context, page };
}
async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login') || u.search.includes('err=')), page.click('button[type=submit]')]);
  await settle(page);
}
// Form actions navigate without a full page load, so wait for the new screen to finish drawing.
const settle = async (page) => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(150); };
const text = async (page) => { await settle(page); return page.locator('body').innerText(); };
const overflowing = (page) => page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.parentElement?.closest('.overflow-x-auto')).slice(0, 4).map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`).join(' | '));
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const north = seed.clientIds.NORTH;
const sunrise = seed.clientIds.SUNR;

// ------------------------------------------------------------ signed out
await step('signed out', async () => {
  const { context, page } = await session();
  await page.goto(`${BASE}/clients`);
  check('signed-out visitor is sent to sign-in', new URL(page.url()).pathname === '/login');
  const r = await page.request.get(`${BASE}/api/payslip/00000000-0000-0000-0000-000000000000`, { maxRedirects: 0 });
  check('signed-out visitor cannot fetch a payslip', [301, 302, 303, 307, 308, 401].includes(r.status()), `status ${r.status()}`);
  await signIn(page, login('Administrator').email, 'definitely-wrong-password');
  check('wrong password is refused', (await text(page)).includes('Email or password is not correct'));
  await context.close();
});

// ------------------------------------------------------------ administrator
let northOctRun = '';
let nt001Line = '';
let e2eClient = '';
let hrTempPassword = '';
const admin = await session();
await step('administrator', async () => {
  const { page } = admin;
  const a = login('Administrator');
  await signIn(page, a.email, a.password);
  check('administrator lands on the client list', new URL(page.url()).pathname === '/clients');
  let t = await text(page);
  check('both sample clients are listed', t.includes('Northfield Traders') && t.includes('Sunrise Foods'));
  await page.screenshot({ path: `${OUT}01-clients.png`, fullPage: true });

  await page.goto(`${BASE}/c/${north}/employees`);
  check('Northfield shows its 6 employees', (await page.locator('tbody tr').count()) === 6);
  check('no Sunrise employee appears under Northfield', !(await text(page)).includes('SF001'));
  await page.screenshot({ path: `${OUT}02-employees.png`, fullPage: true });

  await page.goto(`${BASE}/c/${north}/payroll`);
  t = await text(page);
  check('payroll list shows three months', t.includes('August 2026') && t.includes('September 2026') && t.includes('October 2026'));
  await page.click('a:has-text("October 2026")');
  await page.waitForURL(/\/payroll\/[0-9a-f-]{36}$/);
  northOctRun = page.url().split('/').pop();
  t = await text(page);
  check('October is a draft', t.includes('Draft'));
  check('NT002 net pay is 41,386 (hand-worked)', t.includes('41,386'));
  check('NT005 net pay is 95,775 (hand-worked, old regime TDS 4,225)', t.includes('95,775') && t.includes('4,225'));
  check('unverified-rule warning is shown', t.includes('have not been checked yet'));
  await page.screenshot({ path: `${OUT}03-payroll-run.png`, fullPage: true });

  await page.click('a:has-text("Sample Employee Two")');
  await page.waitForURL(/\/payroll\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  t = await text(page);
  check('working page shows PF 2,323 and the incentive', t.includes('2,323') && t.includes('Sales incentive'));
  await page.screenshot({ path: `${OUT}04-working.png`, fullPage: true });
  const lineId = page.url().split('/').pop();
  const pdf = await page.request.get(`${BASE}/api/payslip/${lineId}`);
  const body = await pdf.body();
  check('payslip downloads as a PDF', pdf.status() === 200 && pdf.headers()['content-type'] === 'application/pdf' && body.subarray(0, 5).toString() === '%PDF-');
  const csv = await page.request.get(`${BASE}/api/register/${northOctRun}`);
  check('salary register downloads as CSV with 6 employees', csv.status() === 200 && (await csv.text()).trim().split('\r\n').length === 7);

  await page.goto(`${BASE}/c/${north}/payroll/${northOctRun}`);
  nt001Line = (await page.locator('a:has-text("Sample Employee One")').getAttribute('href')).split('/').pop();

  // adding a one-off item recalculates
  await page.goto(`${BASE}/c/${north}/payroll/${northOctRun}/${lineId}`);
  await page.fill('input[name=label]', 'Festival bonus');
  await page.fill('input[name=amount]', '1000');
  await Promise.all([page.waitForURL(/msg=/), page.click('button:has-text("Add")')]);
  t = await text(page);
  check('adding a bonus of 1,000 raises net pay to 42,386', t.includes('42,386') && t.includes('Festival bonus'), `${page.url().slice(-80)} :: ${(t.match(/Net pay[^\n]*\n?[^\n]*/) ?? [''])[0]}`);

  // ---- new client, employee, attendance, payroll, lock
  await page.goto(`${BASE}/clients/new`);
  await page.fill('input[name=name]', 'E2E Test Client');
  await page.fill('input[name=code]', 'E2E');
  await page.selectOption('select[name=pf_wage_rule]', 'basic_da');
  await Promise.all([page.waitForURL(/\/c\/[0-9a-f-]{36}\?msg=/), page.click('button:has-text("Add client")')]);
  e2eClient = new URL(page.url()).pathname.split('/')[2];
  check('new client is created', (await text(page)).includes('E2E Test Client'));

  await page.goto(`${BASE}/c/${e2eClient}/employees/new`);
  await page.fill('input[name=emp_code]', 'E001');
  await page.fill('input[name=full_name]', 'Test Person');
  await page.fill('input[name=doj]', '2026-04-01');
  await page.fill('input[name=email]', 'e001@sample.invalid');
  await page.fill('input[name=basic]', '30000');
  await page.fill('input[name=hra]', '15000');
  await page.fill('input[name=pan]', 'abcde1234f');
  await page.fill('input[name=bank_account]', '123456789012');
  await page.fill('input[name=bank_ifsc]', 'SAMP0000000');
  await Promise.all([page.waitForURL(/\/employees\/[0-9a-f-]{36}\?msg=/), page.click('button:has-text("Add employee")')]);
  t = await text(page);
  check('employee page shows masked PAN and account only', t.includes('XXXXXX234F') && t.includes('XXXX9012') && !t.includes('ABCDE1234F'));
  await page.click('button:has-text("Show full numbers")');
  await page.waitForSelector('text=ABCDE1234F');
  check('administrator can reveal the full PAN', true);
  await page.screenshot({ path: `${OUT}05-employee.png`, fullPage: true });

  // bad input is refused with a plain message
  await page.goto(`${BASE}/c/${e2eClient}/employees/new`);
  await page.fill('input[name=emp_code]', 'E001');
  await page.fill('input[name=full_name]', 'Duplicate Person');
  await page.fill('input[name=doj]', '2026-04-01');
  await Promise.all([page.waitForURL(/err=/), page.click('button:has-text("Add employee")')]);
  check('duplicate employee code is refused', (await text(page)).includes('already used'));
  await page.fill('input[name=emp_code]', 'E002');
  await page.fill('input[name=full_name]', 'Bad Pan Person');
  await page.fill('input[name=doj]', '2026-04-01');
  await page.fill('input[name=pan]', 'NOTAPAN');
  await Promise.all([page.waitForURL(/err=/), page.click('button:has-text("Add employee")')]);
  check('badly formed PAN is refused', (await text(page)).includes('PAN must look like'));

  await page.goto(`${BASE}/c/${e2eClient}/attendance?period=2026-10`);
  await page.fill('input[name^=lop_]', '3');
  await Promise.all([page.waitForURL(/msg=/), page.click('button:has-text("Save attendance")')]);
  check('attendance is saved', (await text(page)).includes('saved'));

  await page.goto(`${BASE}/c/${e2eClient}/payroll`);
  await page.fill('input[name=period]', '2026-10');
  await Promise.all([page.waitForURL(/\/payroll\/[0-9a-f-]{36}\?msg=/), page.click('button:has-text("Calculate")')]);
  t = await text(page);
  check('new client October net pay is 37,645 (hand-worked: 3 unpaid days, PF 3,000)', t.includes('37,645') && t.includes('3,000'));
  await page.click('button:has-text("Lock this month")');
  await Promise.all([page.waitForURL(/msg=/), page.click('button:has-text("Yes, lock")')]);
  check('month can be locked', (await text(page)).includes('Locked'));
  await page.goto(`${BASE}/c/${e2eClient}/attendance?period=2026-10`);
  check('attendance is read-only once locked', await page.locator('input[name^=lop_]').first().isDisabled());

  // ---- letter
  await page.goto(`${BASE}/c/${e2eClient}/letters/new`);
  await page.selectOption('select[name=employee]', { index: 1 });
  await page.selectOption('select[name=template]', { label: 'Offer letter' });
  await Promise.all([page.waitForURL(/template=/), page.click('button:has-text("Continue")')]);
  for (const [name, value] of [['ph_probation_months', '6'], ['ph_notice_days', '30'], ['ph_offer_valid_until', '31 October 2026'], ['ph_signatory_name', 'Test Signatory'], ['ph_signatory_designation', 'Director'], ['ph_designation', 'Analyst'], ['ph_location', 'Gurugram'], ['ph_employee_address', 'Sample address'], ['ph_title', 'Mr.']]) {
    const input = page.locator(`input[name=${name}]`);
    if ((await input.count()) && !(await input.inputValue())) await input.fill(value);
  }
  await page.screenshot({ path: `${OUT}06-letter-form.png`, fullPage: true });
  await Promise.all([page.waitForURL(/made=/), page.click('button:has-text("Create letter")')]);
  const docId = new URL(page.url()).searchParams.get('made');
  const doc = await page.request.get(`${BASE}/api/document/${docId}`);
  check('letter is created and downloads as a PDF', doc.status() === 200 && (await doc.body()).subarray(0, 5).toString() === '%PDF-');

  // ---- client HR login with a one-time password
  await page.goto(`${BASE}/users`);
  await page.fill('input[name=full_name]', 'E2E Client HR');
  await page.fill('input[name=email]', 'hr.e2e@sample.invalid');
  await page.selectOption('select[name=role]', 'client_hr');
  await page.selectOption('select[name=client_id]', e2eClient);
  await page.click('button:has-text("Create login")');
  await page.waitForSelector('code');
  hrTempPassword = await page.locator('code').first().innerText();
  check('a temporary password is shown once', /^[a-z2-9-]{19}$/.test(hrTempPassword));
  check('the password is not in the address bar', !page.url().includes(hrTempPassword));
  await page.screenshot({ path: `${OUT}07-logins.png`, fullPage: true });

  for (const path of ['/rules', '/templates', '/audit', `/c/${north}`, `/c/${north}/settings`, `/c/${north}/letters`]) {
    const res = await page.goto(`${BASE}${path}`);
    check(`page ${path} loads`, res.status() === 200);
  }
  await page.goto(`${BASE}/rules`);
  await page.screenshot({ path: `${OUT}08-rules.png`, fullPage: true });
});

// ------------------------------------------------------------ new client HR (temporary password)
await step('new client HR', async () => {
  const { context, page } = await session();
  await signIn(page, 'hr.e2e@sample.invalid', hrTempPassword);
  check('temporary password forces a password change', new URL(page.url()).pathname === '/account');
  await page.goto(`${BASE}/c/${e2eClient}/employees`);
  await settle(page);
  check('pages stay closed until the password is changed', new URL(page.url()).pathname === '/account');
  await page.fill('input[name=current]', hrTempPassword);
  await page.fill('input[name=next]', 'a-brand-new-password-1');
  await page.fill('input[name=again]', 'a-brand-new-password-1');
  await Promise.all([page.waitForURL(/\/c\//), page.click('button:has-text("Change password")')]);
  check('client HR lands on its own client', new URL(page.url()).pathname === `/c/${e2eClient}`);
  let res = await page.goto(`${BASE}/c/${north}`);
  check('client HR cannot open another client', new URL(page.url()).pathname === `/c/${e2eClient}` || res.status() === 404);
  await page.goto(`${BASE}/clients`);
  check('client HR cannot open the client list', new URL(page.url()).pathname === `/c/${e2eClient}`);
  const other = await page.request.get(`${BASE}/api/payslip/${nt001Line}`);
  check("client HR cannot fetch another client's payslip", other.status() === 404, `status ${other.status()}`);
  const reg = await page.request.get(`${BASE}/api/register/${northOctRun}`);
  check("client HR cannot fetch another client's register", reg.status() === 404, `status ${reg.status()}`);
  await page.goto(`${BASE}/c/${e2eClient}/employees`);
  const t = await text(page);
  check('client HR sees its employee but no add or import buttons', t.includes('Test Person') && !t.includes('Add employee'));
  await page.goto(`${BASE}/c/${e2eClient}/employees/new`);
  check('client HR cannot open the add-employee form', !new URL(page.url()).pathname.endsWith('/new'));
  await context.close();
});

// ------------------------------------------------------------ seeded client HR sees locked months only
await step('Northfield HR', async () => {
  const { context, page } = await session();
  const hr = login('Client HR for Northfield');
  await signIn(page, hr.email, hr.password);
  await page.goto(`${BASE}/c/${north}/payroll`);
  const t = await text(page);
  check('client HR sees locked months but not the October draft', t.includes('September 2026') && !t.includes('October 2026'));
  check('client HR has no Run payroll box', !t.includes('Run payroll'));
  const draft = await page.goto(`${BASE}/c/${north}/payroll/${northOctRun}`);
  check('client HR cannot open the draft month by its address', draft.status() === 404);
  const res = await page.goto(`${BASE}/c/${sunrise}/employees`);
  check('Northfield HR cannot open Sunrise', new URL(page.url()).pathname === `/c/${north}` || res.status() === 404);
  await page.goto(`${BASE}/c/${north}/attendance?period=2026-10`);
  await page.locator('input[name^=lop_]').nth(4).fill('1');
  await Promise.all([page.waitForURL(/msg=/), page.click('button:has-text("Save attendance")')]);
  check('client HR can enter attendance for an open month', (await text(page)).includes('saved'));
  await context.close();
});

await step('stale draft notice', async () => {
  const { page } = admin;
  await page.goto(`${BASE}/c/${north}/payroll/${northOctRun}`);
  check('administrator is told attendance changed after the calculation', (await text(page)).includes('Recalculate to bring it up to date'));
});

// ------------------------------------------------------------ employee
await step('employee', async () => {
  const { context, page } = await session({ width: 390, height: 800 });
  const e = login('Employee');
  await signIn(page, e.email, e.password);
  check('employee lands on My page', new URL(page.url()).pathname === '/me');
  const t = await text(page);
  check('employee sees August and September payslips, not the October draft', t.includes('August 2026') && t.includes('September 2026') && !t.includes('October 2026'));
  check('employee sees the letter shared with them', t.includes('Appointment letter'));
  check('My page fits a phone screen', await noSideScroll(page));
  await page.screenshot({ path: `${OUT}09-me-phone.png`, fullPage: true });
  await page.goto(`${BASE}/clients`);
  check('employee cannot open the client list', new URL(page.url()).pathname === '/me');
  await page.goto(`${BASE}/c/${north}/employees`);
  check('employee cannot open the employee list', new URL(page.url()).pathname === '/me');
  const other = await page.request.get(`${BASE}/api/payslip/${nt001Line}`);
  check("employee cannot fetch a colleague's payslip", other.status() === 404, `status ${other.status()}`);
  const own = await page.locator('a:has-text("Open payslip")').first().getAttribute('href');
  const mine = await page.request.get(`${BASE}${own}`);
  check('employee can open their own payslip', mine.status() === 200);
  await context.close();
});

// ------------------------------------------------------------ office staff
await step('office staff', async () => {
  const { context, page } = await session();
  const s = login('Office staff');
  await signIn(page, s.email, s.password);
  await page.goto(`${BASE}/users`);
  check('staff cannot open Logins', new URL(page.url()).pathname === '/clients');
  await page.goto(`${BASE}/audit`);
  check('staff cannot open the activity log', new URL(page.url()).pathname === '/clients');
  await page.goto(`${BASE}/rules`);
  check('staff can read rules but not add them', /provident fund/i.test(await text(page)) && !(await text(page)).includes('Add rule'));
  await page.goto(`${BASE}/c/${e2eClient}/payroll`);
  await page.click('a:has-text("October 2026")');
  await page.waitForURL(/\/payroll\/[0-9a-f-]{36}$/);
  check('staff cannot unlock a locked month', (await text(page)).includes('Only an administrator can unlock'));
  await context.close();
});

// ------------------------------------------------------------ phone layout for the office screens
await step('phone layout', async () => {
  const { context, page } = await session({ width: 390, height: 800 });
  const a = login('Administrator');
  await signIn(page, a.email, a.password);
  for (const [name, path] of [['clients', '/clients'], ['overview', `/c/${north}`], ['payroll', `/c/${north}/payroll/${northOctRun}`], ['employee form', `/c/${north}/employees/new`]]) {
    await page.goto(`${BASE}${path}`);
    await settle(page);
    check(`${name} fits a phone screen`, await noSideScroll(page), await overflowing(page));
  }
  await page.screenshot({ path: `${OUT}10-payroll-phone.png`, fullPage: true });
  await context.close();
});

// ------------------------------------------------------------ newer modules, on a demo client
await step('modules', async () => {
  const { context, page } = await session();
  const a = login('Administrator');
  await signIn(page, a.email, a.password);
  let t = await text(page);
  check('office dashboard shows charts', t.includes('Payroll by month, all clients') && t.includes('Employees by client'));
  await page.fill('#demo_name', 'Prospect Co');
  await page.fill('#demo_industry', 'Manufacturing');
  await page.click('button:has-text("Create demo client")');
  await page.waitForSelector('text=is ready with 12 invented employees', { timeout: 90000 });
  t = await text(page);
  check('demo client is built with payroll', !t.includes('payroll could not be run'), t.match(/payroll could not be run[^\n]*/)?.[0] ?? '');
  const codes = await page.locator('code').allInnerTexts();
  check('three demo logins are shown once', codes.length === 6 && codes[0].startsWith('hr.demo') && codes[2].startsWith('emp.demo'), codes.filter((_, i) => i % 2 === 0).join(','));
  const demo = (await page.locator('a:has-text("Open it")').getAttribute('href')).split('/')[2];
  await page.screenshot({ path: `${OUT}11-demo-created.png`, fullPage: true });

  await page.goto(`${BASE}/c/${demo}`);
  t = await text(page);
  check('client dashboard shows widgets', t.includes('Payroll cost by month') && t.includes('People by department') && t.includes('Birthdays and work anniversaries'));
  check('client dashboard counts pending leave and open concerns', /Leave waiting for approval\s*2/i.test(t) && /Open concerns\s*2/i.test(t), t.slice(0, 600).replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}12-client-dashboard.png`, fullPage: true });

  await page.goto(`${BASE}/c/${demo}/payroll`);
  await settle(page);
  const runLinks = [...new Set(await page.locator(`a[href^="/c/${demo}/payroll/"]`).evaluateAll((els) => els.map((e) => e.getAttribute('href'))))].filter((h) => /payroll\/[0-9a-f-]{36}$/.test(h));
  check('demo has three payroll months', runLinks.length === 3, String(runLinks.length));
  const statuses = [];
  let ecr = '';
  for (const h of runLinks) {
    const r = await page.request.get(`${BASE}/api/export/${h.split('/').pop()}/pf-ecr`);
    statuses.push(r.status());
    if (r.status() === 200) ecr = await r.text();
  }
  check('PF ECR downloads for locked months only', statuses.filter((x) => x === 200).length === 2, statuses.join(','));
  check('PF ECR has one #~# line per member', ecr.trim().split('\n').length === 12 && ecr.includes('#~#'), ecr.slice(0, 120));
  const lockedRun = runLinks[statuses.indexOf(200)].split('/').pop();
  for (const kind of ['esi', 'pt', 'bank']) {
    const r = await page.request.get(`${BASE}/api/export/${lockedRun}/${kind}`);
    check(`${kind} file downloads`, r.status() === 200 && (await r.body()).length > 50, `status ${r.status()}`);
  }

  await page.goto(`${BASE}/c/${demo}/leave`);
  t = await text(page);
  check('leave queue shows pending requests', t.includes('Travel to home town') && t.includes('Bank work'));
  await page.locator('button:has-text("Approve")').first().click();
  t = await text(page);
  check('HR can approve leave', /approved/i.test(t));
  await page.goto(`${BASE}/c/${demo}/attendance/daily`);
  t = await text(page);
  check('daily register lists people and marks', t.includes('Demo Manager One') && /\bP\b/.test(t));
  await page.screenshot({ path: `${OUT}13-daily-register.png`, fullPage: true });

  await page.goto(`${BASE}/c/${demo}/grievances`);
  t = await text(page);
  check('concern list shows time limits', t.includes('Travel claim') && /overdue by/i.test(t) && /no name given/i.test(t));
  await page.click('a:has-text("GRV-") >> nth=0');
  await page.waitForURL(/grievances\/[0-9a-f-]{36}/);
  const grievanceId = page.url().split('/').pop().split('?')[0];
  await page.fill('#c_body', 'Internal: checked with accounts, claim is in the next batch.');
  await page.check('input[name=internal]');
  await page.click('button:has-text("Add")');
  t = await text(page);
  check('internal note is saved', t.includes('Internal note saved') && t.includes('checked with accounts'));
  await page.selectOption('#u_status', 'resolved');
  await page.click('button:has-text("Save")');
  check('resolving needs a written resolution', (await text(page)).includes('Write what was decided'));
  await page.selectOption('#u_status', 'resolved');
  await page.fill('#u_resolution', 'Claim approved. It will be paid with this month salary.');
  await page.click('button:has-text("Save")');
  t = await text(page);
  check('concern can be resolved', t.includes('Saved') && /resolved/i.test(t));
  const pdf = await page.request.get(`${BASE}/api/grievance/${grievanceId}`);
  check('case summary PDF opens', pdf.status() === 200 && (await pdf.body()).subarray(0, 4).toString() === '%PDF');
  await page.screenshot({ path: `${OUT}14-grievance.png`, fullPage: true });

  const found = await (await page.request.post(`${BASE}/api/search`, { data: { q: 'demo sales' } })).json();
  check('quick search finds employees', found.hits.filter((h) => h.kind === 'Employee').length >= 3, JSON.stringify(found.hits).slice(0, 200));
  await page.keyboard.press('Control+k');
  await page.fill('dialog input', 'prospect');
  await page.waitForSelector('dialog [role=option]');
  check('Ctrl+K opens search and lists the client', (await page.locator('dialog').innerText()).includes('Prospect Co'));
  await page.keyboard.press('Escape');
  await page.click('button[aria-label="Switch to dark screen"]');
  await settle(page);
  check('dark screen switches on', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.screenshot({ path: `${OUT}15-dark.png`, fullPage: true });
  await page.click('button[aria-label="Switch to light screen"]');
  await settle(page);

  // the demo employee
  const emp = await session({ width: 390, height: 800 });
  await signIn(emp.page, codes[2], codes[3]);
  check('demo employee lands on My page', new URL(emp.page.url()).pathname === '/me');
  await emp.page.goto(`${BASE}/me/grievances`);
  t = await text(emp.page);
  check('employee sees own concern and the resolution, not the internal note', t.includes('Travel claim') && !t.includes('checked with accounts') && !t.includes('water cooler'));
  check('concern screen fits a phone', await noSideScroll(emp.page), await overflowing(emp.page));
  await emp.page.selectOption('#g_category', 'workplace');
  await emp.page.fill('#g_subject', 'Parking area light is broken');
  await emp.page.fill('#g_description', 'The light in the parking area has been off for three days. It is unsafe at night.');
  await emp.page.check('input[name=anonymous]');
  await emp.page.click('button:has-text("Send to HR")');
  await emp.page.waitForSelector('text=Tracking code');
  const tracking = await emp.page.locator('code').first().innerText();
  check('an anonymous concern gives a tracking code', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(tracking), tracking);
  await emp.page.goto(`${BASE}/me/grievances`);
  t = await text(emp.page);
  check('the anonymous concern is not listed under the employee', !t.includes('Parking area light'));
  await emp.page.fill('#g_code', tracking.toLowerCase());
  await emp.page.click('button:has-text("See status")');
  await emp.page.waitForSelector('text=Parking area light is broken');
  check('tracking code shows the concern', true);
  const denied = await emp.page.request.get(`${BASE}/api/grievance/${grievanceId}`);
  check('employee cannot open the HR case summary', denied.status() === 404, `status ${denied.status()}`);
  const empSearch = await (await emp.page.request.post(`${BASE}/api/search`, { data: { q: 'demo' } })).json();
  check('employee login gets nothing from search', empSearch.hits.length === 0);
  await emp.page.goto(`${BASE}/me/documents`);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await emp.page.setInputFiles('#doc_file', { name: 'pan card.png', mimeType: 'image/png', buffer: png });
  await emp.page.selectOption('#doc_kind', 'pan_card');
  await emp.page.click('button:has-text("Upload")');
  check('employee can upload a document', (await text(emp.page)).includes('Document uploaded'));
  await emp.page.setInputFiles('#doc_file', { name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('this is not an image at all') });
  await emp.page.click('button:has-text("Upload")');
  check('a file that is not a real PDF or image is refused', (await text(emp.page)).includes('Only PDF, JPG and PNG'));
  await emp.page.goto(`${BASE}/me/attendance`);
  await emp.page.click('button:has-text("Punch")');
  t = await text(emp.page);
  check('employee can punch', /punch(ed)? (in|out)/i.test(t) && !/went wrong/i.test(t), t.slice(0, 300).replace(/\n/g, ' | '));
  await emp.page.goto(`${BASE}/me/leave`);
  t = await text(emp.page);
  check('employee sees leave balances', t.includes('Casual Leave') && t.includes('Family function'));
  check('leave screen fits a phone', await noSideScroll(emp.page), await overflowing(emp.page));
  await emp.context.close();

  // the demo client's HR
  const hr = await session();
  await signIn(hr.page, codes[0], codes[1]);
  check('demo HR lands on their own company', new URL(hr.page.url()).pathname === `/c/${demo}`);
  await hr.page.goto(`${BASE}/c/${north}`);
  check('demo HR cannot open another client', new URL(hr.page.url()).pathname === `/c/${demo}`);
  const hrSearch = await (await hr.page.request.post(`${BASE}/api/search`, { data: { q: 'sample' } })).json();
  check('demo HR search does not reach other clients', hrSearch.hits.filter((h) => h.kind !== 'Page').length === 0, JSON.stringify(hrSearch.hits).slice(0, 200));
  await hr.page.goto(`${BASE}/c/${demo}/documents`);
  t = await text(hr.page);
  check('HR sees the uploaded document waiting', /waiting for verification \(1\)/i.test(t));
  const fileHref = await hr.page.locator('a[href^="/api/file/"]').first().getAttribute('href');
  const file = await hr.page.request.get(`${BASE}${fileHref}`);
  check('HR can open the uploaded file, decrypted', file.status() === 200 && (await file.body()).equals(png));
  await hr.page.locator('button:has-text("Verify")').first().click();
  check('HR can verify a document', (await text(hr.page)).includes('Marked as verified'));
  await hr.page.goto(`${BASE}/c/${demo}/grievances`);
  t = await text(hr.page);
  check('HR sees the anonymous concern without a name', t.includes('Parking area light') && !/Parking area light[^\n]*Demo Sales Officer/.test(t));
  await hr.context.close();

  // the demo client's manager approves a team member's leave
  const mgr = await session();
  await signIn(mgr.page, codes[4], codes[5]);
  await mgr.page.goto(`${BASE}/me/leave`);
  t = await text(mgr.page);
  check('manager sees the team request', t.includes('Bank work'));
  await mgr.context.close();

  // delete the demo
  await page.goto(`${BASE}/clients`);
  await page.click('button:has-text("Delete demo")');
  await page.click('button:has-text("Yes, delete")');
  t = await text(page);
  check('demo client can be deleted in one step', t.includes('Demo client deleted') && !t.includes('Prospect Co (demo)'));
  await signIn((await session()).page, codes[0], codes[1]);
  await context.close();
});

// ------------------------------------------------------------ lockout
await step('lockout', async () => {
  const { context, page } = await session();
  for (let i = 0; i < 5; i++) await signIn(page, 'hr.sunrise@sample.invalid', `wrong-${i}`);
  await signIn(page, 'hr.sunrise@sample.invalid', login('Client HR for Sunrise').password);
  check('five wrong passwords lock the login for a while', (await text(page)).includes('Too many wrong attempts'));
  await context.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
