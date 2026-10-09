# WORKLEVEL V12.7

Recurring service jobs (Reinigung / Hausmeister). Keeps V12.4 security, V12.5 cloud leads, V12.6 invoice reminders.

## Recurring jobs
- Additive SQL: `supabase/SETUP-WORKLEVEL-V12.7-RECURRING.sql`
- Table `recurring_job_templates` (company_id, customer_id, title, description, cadence weekly/biweekly/monthly, optional interval_days, next_run_date, active, default_assignee, notes, …) with RLS owner/admin
- Optional `jobs.recurring_template_id`
- RPC `generate_due_recurring_jobs(p_company_id)` — owner/admin; creates jobs for due templates and advances `next_run_date`
- Optional RPC `create_recurring_template(...)`

## UI
- New page **Wiederkehrend** (`/wiederkehrend`) under Aufträge/Plantafel
- Create / edit / activate-pause templates
- Button **„Fällige Aufträge erzeugen“**
- German dark/orange UI with loading / empty / error states

## Packaging
- package.json → `worklevel-v12.7` / `12.7.0`
- Run **V12.7 Recurring SQL once AFTER V12.6 Reminders** (see START-HERE.txt)
