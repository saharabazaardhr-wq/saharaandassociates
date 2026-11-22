-- Sahara & Associates tables (project: sahara-bazaar-control-center). All objects use the sa_ prefix.
-- Already applied as migration "sahara_associates_books_tables".
create table if not exists public.sa_allowed (email text primary key);
alter table public.sa_allowed enable row level security;   -- no policies: read only via sa_is_allowed()
-- Add a login that may use the books:  insert into public.sa_allowed(email) values ('name@example.com');
create or replace function public.sa_is_allowed() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.sa_allowed where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))); $$;
revoke all on function public.sa_is_allowed() from public, anon;
grant execute on function public.sa_is_allowed() to authenticated;
create table if not exists public.sa_docs (coll text not null, id text not null, data jsonb not null, updated_at timestamptz not null default now(), primary key (coll, id));
alter table public.sa_docs enable row level security;
create policy sa_docs_select on public.sa_docs for select to authenticated using ((select public.sa_is_allowed()));
create policy sa_docs_insert on public.sa_docs for insert to authenticated with check ((select public.sa_is_allowed()));
create policy sa_docs_update on public.sa_docs for update to authenticated using ((select public.sa_is_allowed())) with check ((select public.sa_is_allowed()));
create policy sa_docs_delete on public.sa_docs for delete to authenticated using ((select public.sa_is_allowed()));

-- Roles and user management (migration "sahara_associates_user_roles"); edge function "sa-admin" does the user admin work.
alter table public.sa_allowed add column if not exists role text not null default 'user' check (role in ('admin','user'));
alter table public.sa_allowed add column if not exists managed boolean not null default false;
alter table public.sa_allowed add column if not exists created_at timestamptz not null default now();
update public.sa_allowed set role = 'admin' where lower(email) = 'saharabazaar.dhr@gmail.com';
