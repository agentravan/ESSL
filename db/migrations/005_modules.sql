-- Leave, daily attendance, onboarding documents, grievances, demo clients.
-- Additive only: nothing that already exists is changed in meaning.

set search_path = hrms;

-- ---------------------------------------------------------------- client and employee additions
alter table clients
  add column is_demo        boolean not null default false,
  add column industry       text not null default '',
  add column weekly_off     int[] not null default '{0}',        -- 0 = Sunday ... 6 = Saturday
  add column shift_start    time not null default '09:30',
  add column shift_end      time not null default '18:30',
  add column grace_minutes  int not null default 15 check (grace_minutes between 0 and 120),
  add column office_lat     numeric(9,6),
  add column office_lng     numeric(9,6),
  add column office_radius_m int check (office_radius_m is null or office_radius_m between 20 and 50000);

alter table employees add column manager_id uuid;
alter table employees add constraint employees_manager_fk
  foreign key (manager_id, client_id) references employees (id, client_id) on delete set null (manager_id);
alter table employees add constraint employees_not_own_manager check (manager_id is null or manager_id <> id);
create index employees_manager_idx on employees (manager_id) where manager_id is not null;

-- A manager is an employee login with people reporting to them.
create function reports_to_me(p_employee uuid) returns boolean
language sql stable security definer set search_path = hrms, pg_temp as $$
  select exists (
    select 1 from employees e
     where e.id = p_employee and e.manager_id is not null and e.manager_id = my_employee()
  )
$$;

create policy employees_manager on employees for select to hrms_app
  using ((select my_role()) = 'employee' and manager_id = (select my_employee()));

-- ---------------------------------------------------------------- leave
create table leave_types (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  code         text not null check (code ~ '^[A-Z]{2,6}$'),
  name         text not null check (length(name) between 1 and 60),
  annual_quota numeric(5,1) not null default 0 check (annual_quota between 0 and 365),
  paid         boolean not null default true,
  active       boolean not null default true,
  unique (client_id, code),
  unique (id, client_id)
);

create table holidays (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  day       date not null,
  name      text not null check (length(name) between 1 and 80),
  unique (client_id, day)
);

create table leave_requests (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null,
  employee_id   uuid not null,
  leave_type_id uuid not null,
  from_date     date not null,
  to_date       date not null,
  half_day      boolean not null default false,
  days          numeric(5,1) not null check (days > 0),
  reason        text not null default '',
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text not null default '',
  created_at    timestamptz not null default now(),
  check (to_date >= from_date),
  check (not half_day or from_date = to_date),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade,
  foreign key (leave_type_id, client_id) references leave_types (id, client_id) on delete restrict
);
create index leave_requests_emp_idx on leave_requests (employee_id, from_date);
create index leave_requests_client_idx on leave_requests (client_id, status);

-- Credits and corrections to a balance (opening balance, carry forward, comp-off earned ...).
create table leave_adjustments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null,
  employee_id   uuid not null,
  leave_type_id uuid not null,
  year          int not null check (year between 2000 and 2100),
  days          numeric(5,1) not null check (days <> 0),
  note          text not null default '',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade,
  foreign key (leave_type_id, client_id) references leave_types (id, client_id) on delete cascade
);

-- Approve or reject. Allowed for the firm, the client's HR, and the employee's manager.
create function leave_decide(p_request uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = hrms, pg_temp as $$
declare r leave_requests%rowtype;
begin
  select * into r from leave_requests where id = p_request for update;
  if not found then raise exception 'leave request not found'; end if;
  if not (is_firm()
          or (my_role() = 'client_hr' and my_client() = r.client_id)
          or (my_role() = 'employee' and reports_to_me(r.employee_id))) then
    raise exception 'you cannot decide this leave request';
  end if;
  if r.status <> 'pending' then raise exception 'this request has already been decided'; end if;
  if exists (select 1 from payroll_runs pr where pr.client_id = r.client_id and pr.status = 'locked'
              and pr.period = date_trunc('month', r.from_date)::date) and p_approve then
    raise exception 'payroll for that month is locked';
  end if;
  update leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = uid(), decided_at = now(), decision_note = coalesce(p_note, '')
   where id = p_request;
  insert into audit_log (user_id, client_id, action, entity, entity_id, detail)
  values (uid(), r.client_id, case when p_approve then 'leave.approve' else 'leave.reject' end, 'leave_request', p_request::text,
          jsonb_build_object('days', r.days));
end $$;

-- An employee withdraws their own request while it is still waiting.
create function leave_cancel(p_request uuid) returns void
language plpgsql security definer set search_path = hrms, pg_temp as $$
declare r leave_requests%rowtype;
begin
  select * into r from leave_requests where id = p_request for update;
  if not found then raise exception 'leave request not found'; end if;
  if not (r.employee_id = my_employee() or is_firm() or (my_role() = 'client_hr' and my_client() = r.client_id)) then
    raise exception 'you cannot cancel this leave request';
  end if;
  if r.status = 'pending' or (r.status = 'approved' and (is_firm() or my_role() = 'client_hr')) then
    if exists (select 1 from payroll_runs pr where pr.client_id = r.client_id and pr.status = 'locked'
                and pr.period = date_trunc('month', r.from_date)::date) and r.status = 'approved' then
      raise exception 'payroll for that month is locked';
    end if;
    update leave_requests set status = 'cancelled', decided_by = uid(), decided_at = now() where id = p_request;
    insert into audit_log (user_id, client_id, action, entity, entity_id)
    values (uid(), r.client_id, 'leave.cancel', 'leave_request', p_request::text);
  else
    raise exception 'only a waiting request can be withdrawn';
  end if;
end $$;

-- ---------------------------------------------------------------- daily attendance
create table attendance_punches (
  id            bigint generated always as identity primary key,
  client_id     uuid not null,
  employee_id   uuid not null,
  ts            timestamptz not null,
  kind          text not null check (kind in ('in', 'out')),
  source        text not null default 'web' check (source in ('web', 'import', 'manual')),
  lat           numeric(9,6),
  lng           numeric(9,6),
  distance_m    int,
  outside_fence boolean not null default false,
  note          text not null default '',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade
);
create index punches_emp_ts_idx on attendance_punches (employee_id, ts);
create index punches_client_ts_idx on attendance_punches (client_id, ts);
create unique index punches_no_duplicates on attendance_punches (employee_id, ts, kind);

-- ---------------------------------------------------------------- onboarding documents
create table employee_documents (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  employee_id uuid not null,
  kind        text not null check (kind in ('id_proof', 'pan_card', 'address_proof', 'education', 'experience',
                                            'payslips', 'bank_proof', 'photo', 'other')),
  file_name   text not null check (length(file_name) between 1 and 200),
  mime        text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes  int not null check (size_bytes between 1 and 4194304),
  content     bytea not null,             -- encrypted by the app before it reaches the database
  status      text not null default 'uploaded' check (status in ('uploaded', 'verified', 'rejected')),
  note        text not null default '',
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  verified_by uuid,
  verified_at timestamptz,
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade
);
create index employee_documents_emp_idx on employee_documents (employee_id);

-- ---------------------------------------------------------------- grievances
create table grievances (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  ref_no        text not null,
  raised_by     uuid references users(id) on delete set null,  -- null for an anonymous complaint
  employee_id   uuid,
  anonymous     boolean not null default false,
  tracking_hash text,                                           -- lets an anonymous person look up their own case
  category      text not null check (category in ('workplace', 'payroll', 'hr_policy', 'interpersonal', 'harassment', 'other')),
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  subject       text not null check (length(subject) between 3 and 150),
  description   text not null check (length(description) between 10 and 5000),
  status        text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  sla_due_at    timestamptz not null,
  assigned_to   uuid references users(id) on delete set null,
  resolution    text not null default '',
  ai            jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz,
  unique (client_id, ref_no),
  unique (id, client_id),
  check (not anonymous or (raised_by is null and employee_id is null)),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete set null (employee_id)
);
create index grievances_client_idx on grievances (client_id, status);

create table grievance_events (
  id           bigint generated always as identity primary key,
  grievance_id uuid not null,
  client_id    uuid not null,
  at           timestamptz not null default now(),
  actor        uuid,
  kind         text not null check (kind in ('created', 'comment', 'status', 'assigned', 'resolution', 'ai')),
  body         text not null default '',
  internal     boolean not null default false,   -- internal notes are never shown to the person who complained
  foreign key (grievance_id, client_id) references grievances (id, client_id) on delete cascade
);
create index grievance_events_idx on grievance_events (grievance_id, at);

create trigger grievances_touch before update on grievances for each row execute function touch_updated_at();

-- Lets someone who complained anonymously see the status and the replies meant for them.
create function grievance_by_code(p_hash text)
returns table (ref_no text, subject text, status text, created_at timestamptz, resolution text, replies jsonb)
language sql stable security definer set search_path = hrms, pg_temp as $$
  select g.ref_no, g.subject, g.status, g.created_at, g.resolution,
         coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'body', e.body) order by e.at)
                     from grievance_events e
                    where e.grievance_id = g.id and not e.internal and e.kind in ('comment', 'resolution')), '[]'::jsonb)
    from grievances g
   where g.tracking_hash = p_hash and g.anonymous and g.client_id = my_client()
$$;

-- ---------------------------------------------------------------- demo clients
-- A demo client holds invented data for showing a prospect. It can be deleted
-- in one step; a real client cannot.
create function delete_demo_client(p_client uuid) returns void
language plpgsql security definer set search_path = hrms, pg_temp as $$
begin
  if not is_admin() then raise exception 'only an administrator can delete a demo client'; end if;
  if not exists (select 1 from clients where id = p_client and is_demo) then
    raise exception 'only a demo client can be deleted this way';
  end if;
  perform set_config('hrms.deleting_demo', p_client::text, true);
  delete from users where client_id = p_client;
  delete from payroll_lines where client_id = p_client;
  delete from payroll_runs where client_id = p_client;
  delete from attendance_monthly where client_id = p_client;
  delete from payroll_adjustments where client_id = p_client;
  delete from employees where client_id = p_client;
  delete from clients where id = p_client;
  perform set_config('hrms.deleting_demo', '', true);
  insert into audit_log (user_id, action, entity, entity_id) values (uid(), 'demo.delete', 'client', p_client::text);
end $$;

-- The payroll locks step aside only while delete_demo_client() is removing that demo client.
create function deleting_demo(p_client uuid) returns boolean
language sql stable security definer set search_path = hrms, pg_temp as $$
  select coalesce(current_setting('hrms.deleting_demo', true), '') = p_client::text
     and exists (select 1 from clients where id = p_client and is_demo)
$$;

create or replace function guard_payroll_run() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'locked' and not hrms.deleting_demo(old.client_id) then
      raise exception 'payroll for this month is locked';
    end if;
    return old;
  end if;
  if old.status = 'locked' then
    if new.status = 'locked' then
      raise exception 'payroll for this month is locked';
    end if;
    if not hrms.is_admin() then
      raise exception 'only an administrator can unlock payroll';
    end if;
  end if;
  return new;
end $$;

create or replace function guard_payroll_line() returns trigger language plpgsql as $$
declare v_status text; v_client uuid;
begin
  select status, client_id into v_status, v_client from hrms.payroll_runs
   where id = (case when tg_op = 'DELETE' then old.run_id else new.run_id end);
  if v_status = 'locked' and not (tg_op = 'DELETE' and hrms.deleting_demo(v_client)) then
    raise exception 'payroll for this month is locked';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function guard_period_inputs() returns trigger language plpgsql as $$
declare v_client uuid; v_period date;
begin
  if tg_op = 'DELETE' then v_client := old.client_id; v_period := old.period;
  else v_client := new.client_id; v_period := new.period; end if;
  if tg_op = 'DELETE' and hrms.deleting_demo(v_client) then return old; end if;
  if exists (select 1 from hrms.payroll_runs where client_id = v_client and period = v_period and status = 'locked') then
    raise exception 'payroll for this month is locked';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on all functions in schema hrms from public;
grant execute on function
  uid(), my_role(), my_client(), my_employee(), is_firm(), is_admin(),
  auth_user_by_email(text), auth_login_result(uuid, boolean), auth_create_session(uuid, text, int),
  auth_session_user(text), auth_delete_session(text), auth_set_password(uuid, text, boolean),
  auth_my_hash(), audit(text, text, text, uuid, jsonb),
  reports_to_me(uuid), leave_decide(uuid, boolean, text), leave_cancel(uuid),
  grievance_by_code(text), delete_demo_client(uuid), deleting_demo(uuid)
  to hrms_app;

grant select, insert, update, delete on
  leave_types, holidays, leave_requests, leave_adjustments, attendance_punches,
  employee_documents, grievances, grievance_events
  to hrms_app;

-- ---------------------------------------------------------------- row-level security
alter table leave_types        enable row level security;
alter table holidays           enable row level security;
alter table leave_requests     enable row level security;
alter table leave_adjustments  enable row level security;
alter table attendance_punches enable row level security;
alter table employee_documents enable row level security;
alter table grievances         enable row level security;
alter table grievance_events   enable row level security;

-- leave types and holidays: firm and the client's HR manage; that client's employees read
create policy leave_types_firm on leave_types for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy leave_types_hr on leave_types for all to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy leave_types_employee on leave_types for select to hrms_app
  using ((select my_role()) = 'employee' and client_id = (select my_client()));

create policy holidays_firm on holidays for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy holidays_hr on holidays for all to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy holidays_employee on holidays for select to hrms_app
  using ((select my_role()) = 'employee' and client_id = (select my_client()));

-- leave requests: employees see their own and their team's; they apply for themselves only.
-- Approving, rejecting and withdrawing go through leave_decide() and leave_cancel().
create policy leave_requests_firm on leave_requests for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy leave_requests_hr on leave_requests for all to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy leave_requests_own on leave_requests for select to hrms_app
  using ((select my_role()) = 'employee' and (employee_id = (select my_employee()) or reports_to_me(employee_id)));
create policy leave_requests_apply on leave_requests for insert to hrms_app
  with check ((select my_role()) = 'employee' and employee_id = (select my_employee())
              and client_id = (select my_client()) and status = 'pending' and decided_by is null);

create policy leave_adjustments_firm on leave_adjustments for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy leave_adjustments_hr on leave_adjustments for all to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy leave_adjustments_own on leave_adjustments for select to hrms_app
  using ((select my_role()) = 'employee' and employee_id = (select my_employee()));

-- punches: an employee can add only their own, only "now", only from the web
create policy punches_firm on attendance_punches for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy punches_hr on attendance_punches for all to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy punches_own on attendance_punches for select to hrms_app
  using ((select my_role()) = 'employee' and (employee_id = (select my_employee()) or reports_to_me(employee_id)));
create policy punches_punch on attendance_punches for insert to hrms_app
  with check ((select my_role()) = 'employee' and employee_id = (select my_employee())
              and client_id = (select my_client()) and source = 'web'
              and ts between now() - interval '5 minutes' and now() + interval '5 minutes');

-- documents: an employee uploads and reads their own; HR reads and verifies
create policy documents2_firm on employee_documents for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy documents2_hr_read on employee_documents for select to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy documents2_hr_verify on employee_documents for update to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy documents2_own_read on employee_documents for select to hrms_app
  using ((select my_role()) = 'employee' and employee_id = (select my_employee()));
create policy documents2_own_upload on employee_documents for insert to hrms_app
  with check ((select my_role()) = 'employee' and employee_id = (select my_employee())
              and client_id = (select my_client()) and status = 'uploaded' and verified_by is null);
create policy documents2_own_delete on employee_documents for delete to hrms_app
  using ((select my_role()) = 'employee' and employee_id = (select my_employee()) and status <> 'verified');

-- grievances: the person who raised one sees it; an anonymous one is seen only by HR and the firm
create policy grievances_firm on grievances for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy grievances_hr on grievances for all to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy grievances_own on grievances for select to hrms_app
  using ((select my_role()) = 'employee' and raised_by = (select uid()));
create policy grievances_raise on grievances for insert to hrms_app
  with check ((select my_role()) = 'employee' and client_id = (select my_client()) and status = 'open'
              and assigned_to is null and resolution = '' and ai is null
              and ((not anonymous and raised_by = (select uid()) and employee_id = (select my_employee()))
                   or (anonymous and raised_by is null and employee_id is null)));

create policy grievance_events_firm on grievance_events for all to hrms_app
  using ((select is_firm())) with check ((select is_firm()));
create policy grievance_events_hr on grievance_events for all to hrms_app
  using ((select my_role()) = 'client_hr' and client_id = (select my_client()))
  with check ((select my_role()) = 'client_hr' and client_id = (select my_client()));
create policy grievance_events_own on grievance_events for select to hrms_app
  using ((select my_role()) = 'employee' and not internal
         and exists (select 1 from grievances g where g.id = grievance_id and g.raised_by = (select uid())));
create policy grievance_events_reply on grievance_events for insert to hrms_app
  with check ((select my_role()) = 'employee' and not internal and kind in ('created', 'comment')
              and actor = (select uid()) and client_id = (select my_client())
              and exists (select 1 from grievances g where g.id = grievance_id and g.raised_by = (select uid())));
