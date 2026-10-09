begin;
create table public.company_mailboxes (
 company_id uuid primary key references public.companies(id) on delete cascade,
 sender_email text not null,
 provider text not null check(provider in ('gmx','gmx-com','webde','gmail','yahoo')),
 encrypted_password text not null,
 updated_at timestamptz not null default now()
);
alter table public.company_mailboxes enable row level security;
create policy mailbox_read on public.company_mailboxes for select to authenticated using(public.has_company_role(company_id,array['owner','admin']));
create policy mailbox_owner_write on public.company_mailboxes for all to authenticated
 using(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=auth.uid()))
 with check(exists(select 1 from public.companies c where c.id=company_id and c.owner_user_id=auth.uid()));
revoke all on public.company_mailboxes from anon;
grant select,insert,update,delete on public.company_mailboxes to authenticated;
commit;
