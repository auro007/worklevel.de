-- Fehlercodes belong to a named heater or other appliance.
-- The same code may exist once per device (F.22 on two boilers is not the same entry).

alter table public.error_codes
  add column if not exists device_name text;

comment on column public.error_codes.device_name is
  'Heizung oder anderes Gerät, zu dem der Fehlercode gehört';

alter table public.error_codes
  drop constraint if exists error_codes_company_code_unique;

create unique index if not exists error_codes_company_code_device_uidx
  on public.error_codes (company_id, lower(btrim(code)), lower(btrim(coalesce(device_name, ''))));

create index if not exists error_codes_company_device_idx
  on public.error_codes (company_id, lower(btrim(coalesce(device_name, ''))));
