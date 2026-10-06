-- Isolation tests, run while connected as hrms_app (the role the web app uses).
-- Any failed expectation raises an exception and psql exits non-zero.
\set ON_ERROR_STOP on
set search_path = hrms;

create function pg_temp.expect(label text, actual bigint, wanted bigint) returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL: % (got %, wanted %)', label, actual, wanted;
  end if;
  raise notice 'ok: %', label;
end $$;

-- runs a statement that must be refused
create function pg_temp.must_fail(label text, stmt text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'ok: % (refused: %)', label, sqlerrm;
    return;
  end;
  if n = 0 then
    raise notice 'ok: % (no rows affected)', label;
    return;
  end if;
  raise exception 'FAIL: % was allowed (% rows)', label, n;
end $$;

-- ---------------------------------------------------------------- nobody signed in
begin;
select pg_temp.expect('no user: clients', (select count(*) from clients), 0);
select pg_temp.expect('no user: employees', (select count(*) from employees), 0);
select pg_temp.expect('no user: users', (select count(*) from users), 0);
select pg_temp.expect('no user: payroll lines', (select count(*) from payroll_lines), 0);
select pg_temp.expect('no user: documents', (select count(*) from documents), 0);
select pg_temp.expect('no user: rules', (select count(*) from statutory_rules), 0);
select pg_temp.expect('no user: audit', (select count(*) from audit_log), 0);
select pg_temp.must_fail('no user: read sessions', 'select count(*) from sessions');
select pg_temp.must_fail('no user: read password hashes', 'select password_hash from users');
select pg_temp.must_fail('no user: insert client', $$insert into clients (code, name) values ('ZZ', 'Z')$$);
commit;

-- ---------------------------------------------------------------- disabled user
begin;
select set_config('hrms.user_id', '10000000-0000-0000-0000-0000000000ff', true);
select pg_temp.expect('disabled admin: clients', (select count(*) from clients), 0);
select pg_temp.expect('disabled admin: employees', (select count(*) from employees), 0);
commit;

-- ---------------------------------------------------------------- firm administrator
begin;
select set_config('hrms.user_id', '10000000-0000-0000-0000-000000000001', true);
select pg_temp.expect('admin: clients', (select count(*) from clients), 2);
select pg_temp.expect('admin: employees', (select count(*) from employees), 3);
select pg_temp.expect('admin: payroll lines', (select count(*) from payroll_lines), 5);
select pg_temp.expect('admin: users', (select count(*) from users), 6);
select pg_temp.expect('admin: rules visible', (select (count(*) > 0)::int from statutory_rules), 1);
select pg_temp.must_fail('admin: read password hashes', 'select password_hash from users');
select pg_temp.must_fail('admin: change a locked payroll line',
  $$update payroll_lines set net_pay = 99 where run_id = '20000000-0000-0000-0000-00000000000a'$$);
select pg_temp.must_fail('admin: delete a locked run',
  $$delete from payroll_runs where id = '20000000-0000-0000-0000-00000000000a'$$);
select pg_temp.must_fail('admin: attendance for a locked month',
  $$insert into attendance_monthly (client_id, employee_id, period, lop_days)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '2026-08-01', 1)$$);
select pg_temp.must_fail('admin: employee attached to the wrong client',
  $$insert into salary_structures (client_id, employee_id, effective_from, basic)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', '2025-01-01', 1)$$);
select pg_temp.must_fail('admin: edit the audit log', 'update audit_log set action = action');
commit;

-- administrator may unlock, staff may not
begin;
select set_config('hrms.user_id', '10000000-0000-0000-0000-000000000002', true);
select pg_temp.expect('staff: clients', (select count(*) from clients), 2);
select pg_temp.must_fail('staff: unlock payroll',
  $$update payroll_runs set status = 'draft' where id = '20000000-0000-0000-0000-00000000000b'$$);
select pg_temp.must_fail('staff: change a rule', $$update statutory_rules set verified = true$$);
select pg_temp.must_fail('staff: create a user',
  $$insert into users (email, password_hash, full_name, role) values ('x@y.z', 'x', 'X', 'firm_admin')$$);
select pg_temp.expect('staff: audit log hidden', (select count(*) from audit_log), 0);
commit;

begin;
select set_config('hrms.user_id', '10000000-0000-0000-0000-000000000001', true);
update payroll_runs set status = 'draft' where id = '20000000-0000-0000-0000-00000000000b';
select pg_temp.expect('admin: unlocked beta august', (select count(*) from payroll_runs where status = 'draft' and client_id = '00000000-0000-0000-0000-00000000000b'), 1);
rollback;

-- ---------------------------------------------------------------- client HR (Alpha)
begin;
select set_config('hrms.user_id', '10000000-0000-0000-0000-00000000000a', true);
select pg_temp.expect('alpha hr: clients', (select count(*) from clients), 1);
select pg_temp.expect('alpha hr: own client only', (select count(*) from clients where code = 'BETA'), 0);
select pg_temp.expect('alpha hr: employees', (select count(*) from employees), 2);
select pg_temp.expect('alpha hr: beta employees', (select count(*) from employees where emp_code like 'B%'), 0);
select pg_temp.expect('alpha hr: salary structures', (select count(*) from salary_structures), 2);
select pg_temp.expect('alpha hr: runs (locked only)', (select count(*) from payroll_runs), 1);
select pg_temp.expect('alpha hr: lines (locked only)', (select count(*) from payroll_lines), 2);
select pg_temp.expect('alpha hr: documents', (select count(*) from documents), 3);
select pg_temp.expect('alpha hr: templates (4 standard + shared + own)', (select count(*) from letter_templates), 6);
select pg_temp.expect('alpha hr: no beta templates', (select count(*) from letter_templates where name = 'Beta only'), 0);
select pg_temp.expect('alpha hr: users', (select count(*) from users), 1);
select pg_temp.expect('alpha hr: rules hidden', (select count(*) from statutory_rules), 0);
select pg_temp.must_fail('alpha hr: edit an employee', $$update employees set full_name = 'Hacked'$$);
select pg_temp.must_fail('alpha hr: edit salary', $$update salary_structures set basic = 1$$);
select pg_temp.must_fail('alpha hr: add employee to beta',
  $$insert into employees (client_id, emp_code, full_name, doj)
    values ('00000000-0000-0000-0000-00000000000b', 'B999', 'Intruder', '2024-01-01')$$);
select pg_temp.must_fail('alpha hr: attendance for beta',
  $$insert into attendance_monthly (client_id, employee_id, period, lop_days)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', '2026-09-01', 1)$$);
select pg_temp.must_fail('alpha hr: lock a run', $$update payroll_runs set status = 'locked'$$);
select pg_temp.must_fail('alpha hr: make self admin', $$update users set full_name = 'x', active = true where role = 'firm_admin'$$);
-- allowed: attendance for own client in an open month
insert into attendance_monthly (client_id, employee_id, period, lop_days)
  values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '2026-09-01', 2);
select pg_temp.expect('alpha hr: own attendance saved', (select count(*) from attendance_monthly), 1);
rollback;

-- ---------------------------------------------------------------- client HR (Beta)
begin;
select set_config('hrms.user_id', '10000000-0000-0000-0000-00000000000b', true);
select pg_temp.expect('beta hr: employees', (select count(*) from employees), 1);
select pg_temp.expect('beta hr: alpha employees', (select count(*) from employees where emp_code like 'A%'), 0);
select pg_temp.expect('beta hr: lines', (select count(*) from payroll_lines), 1);
select pg_temp.expect('beta hr: documents', (select count(*) from documents), 1);
select pg_temp.expect('beta hr: templates (4 standard + shared + own)', (select count(*) from letter_templates), 6);
select pg_temp.expect('beta hr: no alpha templates', (select count(*) from letter_templates where name = 'Alpha only'), 0);
commit;

-- ---------------------------------------------------------------- employee (Asha, Alpha)
begin;
select set_config('hrms.user_id', '10000000-0000-0000-0000-0000000000a1', true);
select pg_temp.expect('employee: sees only self', (select count(*) from employees), 1);
select pg_temp.expect('employee: own salary structure', (select count(*) from salary_structures), 1);
select pg_temp.expect('employee: own locked payslips', (select count(*) from payroll_lines), 1);
select pg_temp.expect('employee: shared documents only', (select count(*) from documents), 1);
select pg_temp.expect('employee: templates hidden', (select count(*) from letter_templates), 0);
select pg_temp.expect('employee: attendance hidden', (select count(*) from attendance_monthly), 0);
select pg_temp.expect('employee: users', (select count(*) from users), 1);
select pg_temp.expect('employee: own client name', (select count(*) from clients), 1);
select pg_temp.must_fail('employee: edit self', $$update employees set designation = 'CEO'$$);
select pg_temp.must_fail('employee: write attendance',
  $$insert into attendance_monthly (client_id, employee_id, period, lop_days)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '2026-09-01', 0)$$);
select pg_temp.must_fail('employee: set another password',
  $$select auth_set_password('10000000-0000-0000-0000-000000000001', 'pwned', false)$$);
commit;

-- ---------------------------------------------------------------- login helpers
begin;
select pg_temp.expect('lookup by email works without a session',
  (select count(*) from auth_user_by_email('  HR@Alpha.local ')), 1);
select auth_create_session('10000000-0000-0000-0000-00000000000a', 'tokhash', 12);
select pg_temp.expect('session resolves to its user',
  (select count(*) from auth_session_user('tokhash') where email = 'hr@alpha.local'), 1);
select pg_temp.expect('unknown session resolves to nobody', (select count(*) from auth_session_user('nope')), 0);
select auth_login_result('10000000-0000-0000-0000-00000000000b', false);
select auth_login_result('10000000-0000-0000-0000-00000000000b', false);
select auth_login_result('10000000-0000-0000-0000-00000000000b', false);
select auth_login_result('10000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect('not locked after four failures',
  (select count(*) from auth_user_by_email('hr@beta.local') where locked_until is null), 1);
select auth_login_result('10000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect('locked after five failures',
  (select count(*) from auth_user_by_email('hr@beta.local') where locked_until > now()), 1);
rollback;

\echo ALL ISOLATION TESTS PASSED
