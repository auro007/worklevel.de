# WORKLEVEL V12.6

Invoice payment reminders — useful **without** Resend. Carries V12.4 security + V12.5 cloud leads.

## Payment reminders
- Additive SQL: `supabase/SETUP-WORKLEVEL-V12.6-REMINDERS.sql`
- Columns on `documents`: `last_reminder_at`, `reminder_count`
- Table `document_reminders` (audit: channel manual/email/mailto/copy)
- RPC `mark_invoice_reminded(p_document, p_channel, p_note)` — owner/admin only; sets Offen→Überfällig when past due; logs `reminder_logged` event
- View `overdue_open_invoices` (security_invoker) for overdue open invoices
- Event type whitelist extended with `reminder_logged`; `log_document_event` updated

## Rechnungen UI
- Overdue rows highlighted (pill, due date, reminder count)
- Stat „Überfällig“ instead of only „Bezahlt“
- Button **„Mahnung / Erinnerung vermerken“**:
  - Always calls RPC (offline workflow)
  - Optional Resend via existing `/api/send-document`
  - Fallbacks: Text kopieren, mailto, „Nur vermerken“

## Dashboard
- Cloud count + amount of overdue invoices (not demo)
- Stat card „Überfällige Rechnungen“

## Packaging
- package.json → `worklevel-v12.6` / `12.6.0`
- Run **V12.6 Reminders SQL once AFTER V12.5 Leads** (see START-HERE.txt)
- Resend remains optional (`.env.example` unchanged)
