-- Run once per database as a superuser (or as "postgres" on Supabase):
--   psql -v owner_pw='...' -v app_pw='...' -f scripts/bootstrap-roles.sql
--
-- hrms_owner owns the tables and runs migrations.
-- hrms_app is what the web app logs in as. It owns nothing, so row-level
-- security always applies to it.

select 'create role hrms_owner login' where not exists (select 1 from pg_roles where rolname = 'hrms_owner') \gexec
select 'create role hrms_app login'   where not exists (select 1 from pg_roles where rolname = 'hrms_app') \gexec

alter role hrms_owner with login nosuperuser nocreatedb nocreaterole nobypassrls password :'owner_pw';
alter role hrms_app   with login nosuperuser nocreatedb nocreaterole nobypassrls password :'app_pw';

grant hrms_owner to current_user;
create schema if not exists hrms authorization hrms_owner;

alter role hrms_owner set search_path = hrms;
alter role hrms_app   set search_path = hrms;
