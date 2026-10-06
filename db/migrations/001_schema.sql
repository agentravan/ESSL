-- Teamwork HRMS: core schema.
-- Runs as hrms_owner inside schema "hrms". The web app connects as hrms_app,
-- which owns nothing and is subject to row-level security (see 002_rls.sql).

set search_path = hrms;

-- ---------------------------------------------------------------- firm
create table firm_settings (
  id          int primary key default 1 check (id = 1),
  firm_name   text not null default 'My HR Office',
  address     text not null default '',
  phone       text not null default '',
  email       text not null default ''
);
insert into firm_settings (id) values (1);

-- ---------------------------------------------------------------- clients
create table clients (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9_-]{2,12}$'),
  name          text not null,
  legal_name    text not null default '',
  address       text not null default '',
  state         text not null default 'HR',
  contact_name  text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  pf_code       text not null default '',
  esi_code      text not null default '',
  pan           text not null default '',
  tan           text not null default '',
  gstin         text not null default '',
  -- payroll settings
  -- pf_wage_rule: 'basic_da' = PF on Basic + DA only (long-standing practice)
  --               'fifty_percent' = labour-code rule, PF wage is at least 50% of gross
  --               null = not decided yet; payroll will not run until someone chooses
  pf_wage_rule  text check (pf_wage_rule in ('basic_da', 'fifty_percent')),
  day_basis     text not null default 'calendar' check (day_basis in ('calendar', 'fixed26', 'fixed30')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- employees
create table employees (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete restrict,
  emp_code          text not null,
  full_name         text not null,
  father_name       text not null default '',
  gender            text not null default 'M' check (gender in ('M', 'F', 'O')),
  dob               date,
  doj               date not null,
  exit_date         date,
  designation       text not null default '',
  department        text not null default '',
  location          text not null default '',
  work_state        text not null default 'HR',
  email             text not null default '',
  phone             text not null default '',
  address           text not null default '',
  status            text not null default 'active'
                    check (status in ('pre_onboarding', 'probation', 'active', 'on_notice', 'exited')),
  -- statutory flags
  pf_applicable     boolean not null default true,
  pf_restrict       boolean not null default true,   -- restrict PF wage to the ceiling
  eps_applicable    boolean not null default true,
  uan               text not null default '',
  pf_number         text not null default '',
  esi_applicable    boolean not null default false,
  esi_number        text not null default '',
  pwd               boolean not null default false,  -- person with disability (higher ESI limit)
  pt_applicable     boolean not null default true,
  tax_regime        text not null default 'new' check (tax_regime in ('new', 'old')),
  old_regime_deductions numeric(12,2) not null default 0, -- declared annual deductions/exemptions (old regime)
  tds_override_monthly  numeric(12,2),                    -- if set, used instead of the computed TDS
  opening_fy            text not null default '',         -- e.g. '2026-27'
  opening_taxable_ytd   numeric(14,2) not null default 0, -- taxable salary already paid this FY outside this system
  opening_tds_ytd       numeric(14,2) not null default 0,
  -- sensitive identifiers: masked value for display, encrypted value (AES-256-GCM, key held by the app)
  pan_masked        text not null default '',
  pan_enc           text,
  aadhaar_last4     text not null default '',
  aadhaar_enc       text,
  bank_name         text not null default '',
  bank_ifsc         text not null default '',
  bank_acct_last4   text not null default '',
  bank_acct_enc     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (client_id, emp_code),
  unique (id, client_id)
);
create index employees_client_idx on employees (client_id, status);

create table salary_structures (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null,
  employee_id    uuid not null,
  effective_from date not null,
  basic          numeric(12,2) not null default 0 check (basic >= 0),
  da             numeric(12,2) not null default 0 check (da >= 0),
  hra            numeric(12,2) not null default 0 check (hra >= 0),
  conveyance     numeric(12,2) not null default 0 check (conveyance >= 0),
  medical        numeric(12,2) not null default 0 check (medical >= 0),
  special        numeric(12,2) not null default 0 check (special >= 0),
  lta            numeric(12,2) not null default 0 check (lta >= 0),
  other          numeric(12,2) not null default 0 check (other >= 0),
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  unique (employee_id, effective_from),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade
);

-- ---------------------------------------------------------------- attendance
create table attendance_monthly (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null,
  employee_id   uuid not null,
  period        date not null check (extract(day from period) = 1),
  lop_days      numeric(5,2) not null default 0 check (lop_days >= 0 and lop_days <= 31),
  remarks       text not null default '',
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  unique (employee_id, period),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade
);
create index attendance_client_period_idx on attendance_monthly (client_id, period);

-- one-off earnings and deductions for a month (arrears, incentive, advance recovery ...)
create table payroll_adjustments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null,
  employee_id   uuid not null,
  period        date not null check (extract(day from period) = 1),
  kind          text not null check (kind in ('earning', 'deduction')),
  label         text not null check (length(label) between 1 and 60),
  amount        numeric(12,2) not null check (amount > 0),
  taxable       boolean not null default true,
  created_at    timestamptz not null default now(),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade
);
create index adjustments_client_period_idx on payroll_adjustments (client_id, period);

-- ---------------------------------------------------------------- payroll
create table payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete restrict,
  period       date not null check (extract(day from period) = 1),
  status       text not null default 'draft' check (status in ('draft', 'locked')),
  settings     jsonb not null default '{}',   -- client settings and rule ids used
  totals       jsonb not null default '{}',
  computed_at  timestamptz,
  computed_by  uuid,
  locked_at    timestamptz,
  locked_by    uuid,
  created_at   timestamptz not null default now(),
  unique (client_id, period),
  unique (id, client_id)
);

create table payroll_lines (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null,
  client_id        uuid not null,
  employee_id      uuid not null,
  emp              jsonb not null,            -- snapshot of employee details at the time of the run
  calc             jsonb not null,            -- full calculation with working
  paid_days        numeric(5,2) not null,
  gross_full       numeric(12,2) not null,
  gross_earned     numeric(12,2) not null,
  taxable_earned   numeric(12,2) not null,
  pf_employee      numeric(12,2) not null,
  esi_employee     numeric(12,2) not null,
  pt               numeric(12,2) not null,
  tds              numeric(12,2) not null,
  other_deductions numeric(12,2) not null,
  total_deductions numeric(12,2) not null,
  net_pay          numeric(12,2) not null,
  employer_pf      numeric(12,2) not null,   -- EPF + EPS (excludes EDLI and admin charges)
  employer_esi     numeric(12,2) not null,
  unique (run_id, employee_id),
  foreign key (run_id, client_id) references payroll_runs (id, client_id) on delete cascade,
  foreign key (employee_id, client_id) references employees (id, client_id) on delete restrict
);
create index payroll_lines_emp_idx on payroll_lines (employee_id);

-- ---------------------------------------------------------------- statutory rules
-- Firm-wide, effective-dated. Nothing statutory is hard-coded in the application.
create table statutory_rules (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('pf', 'esi', 'pt', 'tax_new', 'tax_old')),
  state          text not null default '',    -- only for kind = 'pt'
  effective_from date not null,
  effective_to   date,
  data           jsonb not null,
  source         text not null default '',
  verified       boolean not null default false,
  verified_by    uuid,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (kind, state, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

-- ---------------------------------------------------------------- letters and documents
create table letter_templates (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,  -- null = available to every client
  name        text not null check (length(name) between 1 and 80),
  kind        text not null default 'other',
  body        text not null,
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table documents (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null,
  employee_id         uuid not null,
  title               text not null,
  ref_no              text not null default '',
  template_id         uuid references letter_templates(id) on delete set null,
  body                text not null,         -- final text with every placeholder filled in
  data                jsonb not null default '{}', -- figures frozen when the letter was made (salary table rows)
  letter_date         date not null default current_date,
  visible_to_employee boolean not null default false,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade
);
create index documents_emp_idx on documents (employee_id);

-- ---------------------------------------------------------------- users, sessions, audit
create table users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null check (email = lower(email) and email like '%_@_%'),
  password_hash    text not null,
  full_name        text not null,
  role             text not null check (role in ('firm_admin', 'firm_staff', 'client_hr', 'employee')),
  client_id        uuid references clients(id) on delete cascade,
  employee_id      uuid,
  active           boolean not null default true,
  must_change_password boolean not null default true,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  unique (email),
  foreign key (employee_id, client_id) references employees (id, client_id) on delete cascade,
  check (
    (role in ('firm_admin', 'firm_staff') and client_id is null and employee_id is null) or
    (role = 'client_hr' and client_id is not null and employee_id is null) or
    (role = 'employee' and client_id is not null and employee_id is not null)
  )
);

create table sessions (
  token_hash  text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

create table audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  client_id  uuid,
  action     text not null,
  entity     text not null default '',
  entity_id  text not null default '',
  detail     jsonb not null default '{}'
);
create index audit_at_idx on audit_log (at desc);

-- ---------------------------------------------------------------- housekeeping triggers
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger clients_touch before update on clients for each row execute function touch_updated_at();
create trigger employees_touch before update on employees for each row execute function touch_updated_at();
create trigger templates_touch before update on letter_templates for each row execute function touch_updated_at();
create trigger rules_touch before update on statutory_rules for each row execute function touch_updated_at();
