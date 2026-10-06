-- Test fixture, loaded as hrms_owner. Two clients that must never see each other.
set search_path = hrms;
insert into clients (id, code, name, pf_wage_rule) values
  ('00000000-0000-0000-0000-00000000000a', 'ALPHA', 'Alpha Traders', 'basic_da'),
  ('00000000-0000-0000-0000-00000000000b', 'BETA', 'Beta Foods', 'basic_da');
insert into employees (id, client_id, emp_code, full_name, doj) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A001', 'Asha Alpha', '2024-01-01'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'A002', 'Amit Alpha', '2024-01-01'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B001', 'Bina Beta', '2024-01-01');
insert into salary_structures (client_id, employee_id, effective_from, basic) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '2024-01-01', 20000),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', '2024-01-01', 22000),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', '2024-01-01', 30000);
insert into users (id, email, password_hash, full_name, role, client_id, employee_id) values
  ('10000000-0000-0000-0000-000000000001', 'admin@test.local', 'x', 'Admin', 'firm_admin', null, null),
  ('10000000-0000-0000-0000-000000000002', 'staff@test.local', 'x', 'Staff', 'firm_staff', null, null),
  ('10000000-0000-0000-0000-00000000000a', 'hr@alpha.local', 'x', 'Alpha HR', 'client_hr', '00000000-0000-0000-0000-00000000000a', null),
  ('10000000-0000-0000-0000-00000000000b', 'hr@beta.local', 'x', 'Beta HR', 'client_hr', '00000000-0000-0000-0000-00000000000b', null),
  ('10000000-0000-0000-0000-0000000000a1', 'asha@alpha.local', 'x', 'Asha Alpha', 'employee', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000ff', 'gone@test.local', 'x', 'Disabled Admin', 'firm_admin', null, null);
update users set active = false where email = 'gone@test.local';
insert into payroll_runs (id, client_id, period, status) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '2026-08-01', 'draft'),
  ('20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '2026-09-01', 'draft'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '2026-08-01', 'draft');
insert into payroll_lines (run_id, client_id, employee_id, emp, calc, paid_days, gross_full, gross_earned, taxable_earned,
  pf_employee, esi_employee, pt, tds, other_deductions, total_deductions, net_pay, employer_pf, employer_esi)
select r.id, r.client_id, e.id, '{}', '{}', 30, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0
  from payroll_runs r join employees e on e.client_id = r.client_id;
update payroll_runs set status = 'locked', locked_at = now() where period = '2026-08-01';
insert into documents (client_id, employee_id, title, body, visible_to_employee) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Offer letter', 'x', true),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Internal note', 'x', false),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'Offer letter', 'x', true),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Offer letter', 'x', true);
insert into letter_templates (client_id, name, body) values
  (null, 'Shared', 'x'),
  ('00000000-0000-0000-0000-00000000000a', 'Alpha only', 'x'),
  ('00000000-0000-0000-0000-00000000000b', 'Beta only', 'x');
