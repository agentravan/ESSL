-- Teamwork HRMS: who can see and change what.
--
-- The web app connects as hrms_app and, at the start of every transaction, runs
--   select set_config('hrms.user_id', '<uuid of the logged-in user>', true);
-- Every policy below is written in terms of that user. If the app forgets a
-- "where client_id = ..." somewhere, the database still refuses to show another
-- client's rows.

set search_path = hrms;

-- ---------------------------------------------------------------- identity helpers
create function uid() returns uuid language sql stable as $$
  select nullif(current_setting('hrms.user_id', true), '')::uuid
$$;

create function my_role() returns text
language sql stable security definer set search_path = hrms, pg_temp as $$
  select role from users where id = uid() and active
$$;

create function my_client() returns uuid
language sql stable security definer set search_path = hrms, pg_temp as $$
  select client_id from users where id = uid() and active
$$;

create function my_employee() returns uuid
language sql stable security definer set search_path = hrms, pg_temp as $$
  select employee_id from users where id = uid() and active
$$;

create function is_firm() returns boolean
language sql stable security definer set search_path = hrms, pg_temp as $$
  select coalesce((select role in ('firm_admin', 'firm_staff') from users where id = uid() and active), false)
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = hrms, pg_temp as $$
  select coalesce((select role = 'firm_admin' from users where id = uid() and active), false)
$$;

-- ---------------------------------------------------------------- login (no user context yet)
create function auth_user_count() returns bigint
language sql stable security definer set search_path = hrms, pg_temp as $$
  select count(*) from users
$$;

-- First-run only: creates the first administrator when no user exists at all.
create function auth_bootstrap_admin(p_email text, p_name text, p_hash text) returns uuid
language plpgsql security definer set search_path = hrms, pg_temp as $$
declare v_id uuid;
begin
  lock table users in share row exclusive mode;
  if exists (select 1 from users) then
    raise exception 'setup already completed';
  end if;
  insert into users (email, full_name, password_hash, role, must_change_password)
  values (lower(trim(p_email)), p_name, p_hash, 'firm_admin', false)
  returning id into v_id;
  insert into audit_log (user_id, action, entity, entity_id) values (v_id, 'setup.first_admin', 'user', v_id::text);
  return v_id;
end $$;

create function auth_user_by_email(p_email text)
returns table (id uuid, password_hash text, active boolean, locked_until timestamptz)
language sql stable security definer set search_path = hrms, pg_temp as $$
  select u.id, u.password_hash, u.active, u.locked_until from users u where u.email = lower(trim(p_email))
$$;

-- Five wrong passwords in a row lock the account for 15 minutes.
create function auth_login_result(p_user uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = hrms, pg_temp as $$
begin
  if p_ok then
    update users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = p_user;
    insert into audit_log (user_id, action, entity, entity_id) values (p_user, 'login.ok', 'user', p_user::text);
  else
    update users
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
     where id = p_user;
    update users set failed_attempts = 0 where id = p_user and failed_attempts >= 5;
    insert into audit_log (user_id, action, entity, entity_id) values (p_user, 'login.failed', 'user', p_user::text);
  end if;
end $$;

create function auth_create_session(p_user uuid, p_token_hash text, p_hours int) returns void
language plpgsql security definer set search_path = hrms, pg_temp as $$
begin
  delete from sessions where expires_at < now();
  insert into sessions (token_hash, user_id, expires_at)
  values (p_token_hash, p_user, now() + make_interval(hours => least(greatest(p_hours, 1), 24)));
end $$;

create function auth_session_user(p_token_hash text)
returns table (id uuid, email text, full_name text, role text, client_id uuid, employee_id uuid, must_change_password boolean)
language sql stable security definer set search_path = hrms, pg_temp as $$
  select u.id, u.email, u.full_name, u.role, u.client_id, u.employee_id, u.must_change_password
    from sessions s join users u on u.id = s.user_id
   where s.token_hash = p_token_hash and s.expires_at > now() and u.active
$$;

create function auth_delete_session(p_token_hash text) returns void
language sql security definer set search_path = hrms, pg_temp as $$
  delete from sessions where token_hash = p_token_hash
$$;

-- A user changes their own password; an administrator can reset anyone's.
create function auth_set_password(p_user uuid, p_hash text, p_must_change boolean) returns void
language plpgsql security definer set search_path = hrms, pg_temp as $$
begin
  if uid() is null or not (uid() = p_user or is_admin()) then
    raise exception 'not allowed';
  end if;
  update users set password_hash = p_hash, must_change_password = p_must_change,
                   failed_attempts = 0, locked_until = null
   where id = p_user;
  delete from sessions where user_id = p_user and uid() <> p_user;
  insert into audit_log (user_id, action, entity, entity_id) values (uid(), 'password.set', 'user', p_user::text);
end $$;

-- Reads the caller's own password hash (needed to confirm the current password).
create function auth_my_hash() returns text
language sql stable security definer set search_path = hrms, pg_temp as $$
  select password_hash from users where id = uid() and active
$$;

create function audit(p_action text, p_entity text, p_entity_id text, p_client uuid, p_detail jsonb) returns void
language sql security definer set search_path = hrms, pg_temp as $$
  insert into audit_log (user_id, client_id, action, entity, entity_id, detail)
  values (uid(), p_client, p_action, p_entity, coalesce(p_entity_id, ''), coalesce(p_detail, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------- integrity triggers
-- A locked payroll run is a record of what was paid. Nothing under it may change.
create function guard_payroll_run() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'locked' then raise exception 'payroll for this month is locked'; end if;
    return old;
  end if;
  if old.status = 'locked' then
    if new.status = 'locked' then
      raise exception 'payroll for this month is locked';
    end if;
    if not is_admin() then
      raise exception 'only an administrator can unlock payroll';
    end if;
  end if;
  return new;
end $$;
create trigger payroll_runs_guard before update or delete on payroll_runs
  for each row execute function guard_payroll_run();

create function guard_payroll_line() returns trigger language plpgsql as $$
declare v_status text;
begin
  select status into v_status from payroll_runs
   where id = (case when tg_op = 'DELETE' then old.run_id else new.run_id end);
  if v_status = 'locked' then raise exception 'payroll for this month is locked'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger payroll_lines_guard before insert or update or delete on payroll_lines
  for each row execute function guard_payroll_line();

-- Attendance and adjustments for a month cannot change once that month's payroll is locked.
create function guard_period_inputs() returns trigger language plpgsql as $$
declare v_client uuid; v_period date;
begin
  if tg_op = 'DELETE' then v_client := old.client_id; v_period := old.period;
  else v_client := new.client_id; v_period := new.period; end if;
  if exists (select 1 from payroll_runs where client_id = v_client and period = v_period and status = 'locked') then
    raise exception 'payroll for this month is locked';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger attendance_guard before insert or update or delete on attendance_monthly
  for each row execute function guard_period_inputs();
create trigger adjustments_guard before insert or update or delete on payroll_adjustments
  for each row execute function guard_period_inputs();

-- The audit log can only grow.
create function guard_audit() returns trigger language plpgsql as $$
begin
  raise exception 'the audit log cannot be changed';
end $$;
create trigger audit_guard before update or delete on audit_log
  for each row execute function guard_audit();

-- ---------------------------------------------------------------- privileges
grant usage on schema hrms to hrms_app;
revoke all on all tables in schema hrms from hrms_app;
revoke all on all functions in schema hrms from public;

grant select, insert, update, delete on
  clients, employees, salary_structures, attendance_monthly, payroll_adjustments,
  payroll_runs, payroll_lines, statutory_rules, letter_templates, documents
  to hrms_app;
grant select, update on firm_settings to hrms_app;
-- users: the password hash is never readable by the app role; it is only
-- written on insert and through auth_set_password().
grant select (id, email, full_name, role, client_id, employee_id, active, must_change_password,
              failed_attempts, locked_until, last_login_at, created_at) on users to hrms_app;
grant insert (email, password_hash, full_name, role, client_id, employee_id, active, must_change_password)
  on users to hrms_app;
grant update (email, full_name, active) on users to hrms_app;
grant delete on users to hrms_app;
grant select on audit_log to hrms_app;
-- sessions: no direct access at all; only through the auth_* functions.

grant execute on function
  uid(), my_role(), my_client(), my_employee(), is_firm(), is_admin(),
  auth_user_count(), auth_bootstrap_admin(text, text, text), auth_user_by_email(text),
  auth_login_result(uuid, boolean), auth_create_session(uuid, text, int),
  auth_session_user(text), auth_delete_session(text), auth_set_password(uuid, text, boolean),
  auth_my_hash(), audit(text, text, text, uuid, jsonb)
  to hrms_app;

-- ---------------------------------------------------------------- row-level security
alter table firm_settings       enable row level security;
alter table clients             enable row level security;
alter table employees           enable row level security;
alter table salary_structures   enable row level security;
alter table attendance_monthly  enable row level security;
alter table payroll_adjustments enable row level security;
alter table payroll_runs        enable row level security;
alter table payroll_lines       enable row level security;
alter table statutory_rules     enable row level security;
alter table letter_templates    enable row level security;
alter table documents           enable row level security;
alter table users               enable row level security;
alter table sessions            enable row level security;
alter table audit_log           enable row level security;

-- firm settings: everyone signed in can read the firm name; administrators edit
create policy firm_read on firm_settings for select to hrms_app using ((select uid()) is not null);
create policy firm_write on firm_settings for update to hrms_app
  using ((select is_admin())) with check ((select is_admin()));

-- clients
create policy clients_firm on clients for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy clients_own on clients for select to hrms_app
  using (id = (select my_client()));

-- employees
create policy employees_firm on employees for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy employees_client_hr on employees for select to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy employees_self on employees for select to hrms_app
  using ((select my_role()) = 'employee' and id = (select my_employee()));

-- salary structures: firm manages; client HR reads own client; employee reads own
create policy salary_firm on salary_structures for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy salary_client_hr on salary_structures for select to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy salary_self on salary_structures for select to hrms_app
  using ((select my_role()) = 'employee' and employee_id = (select my_employee()));

-- attendance: firm manages; client HR reads and enters for own client
create policy attendance_firm on attendance_monthly for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy attendance_client_hr on attendance_monthly for all to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));

-- adjustments: firm only (client HR can read own client)
create policy adjustments_firm on payroll_adjustments for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy adjustments_client_hr on payroll_adjustments for select to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()));

-- payroll runs and lines: firm manages; others see locked months only
create policy runs_firm on payroll_runs for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy runs_client_hr on payroll_runs for select to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()) and status = 'locked');
create policy runs_employee on payroll_runs for select to hrms_app
  using ((select my_role()) = 'employee' and client_id = (select my_client()) and status = 'locked');

create policy lines_firm on payroll_lines for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy lines_client_hr on payroll_lines for select to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client())
         and exists (select 1 from payroll_runs r where r.id = run_id and r.status = 'locked'));
create policy lines_self on payroll_lines for select to hrms_app
  using ((select my_role()) = 'employee' and employee_id = (select my_employee())
         and exists (select 1 from payroll_runs r where r.id = run_id and r.status = 'locked'));

-- statutory rules: firm reads, administrators change
create policy rules_read on statutory_rules for select to hrms_app using ((select is_firm()));
create policy rules_insert on statutory_rules for insert to hrms_app with check ((select is_admin()));
create policy rules_update on statutory_rules for update to hrms_app
  using ((select is_admin())) with check ((select is_admin()));
create policy rules_delete on statutory_rules for delete to hrms_app using ((select is_admin()));

-- letter templates: firm manages; client HR reads shared and own
create policy templates_firm on letter_templates for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy templates_client_hr on letter_templates for select to hrms_app
  using ((select my_role()) = 'client_hr' and (client_id is null or client_id = (select my_client())));

-- documents: firm manages; client HR reads own client; employee reads own when shared
create policy documents_firm on documents for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy documents_client_hr on documents for select to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy documents_self on documents for select to hrms_app
  using ((select my_role()) = 'employee' and employee_id = (select my_employee()) and visible_to_employee);

-- users: administrators manage; everyone can read their own row; firm staff can read names
create policy users_admin on users for all to hrms_app
  using ((select is_admin())) with check ((select is_admin()));
create policy users_firm_read on users for select to hrms_app using ((select is_firm()));
create policy users_self on users for select to hrms_app using (id = (select uid()));

-- audit log: administrators read. Rows are written through audit() only.
create policy audit_read on audit_log for select to hrms_app using ((select is_admin()));
