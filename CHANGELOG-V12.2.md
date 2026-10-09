# WORKLEVEL V12.2

- Nachkalkulation now reads actual `job_time_entries` instead of planned `estimatedHours`.
- Nachkalkulation revenue now reads real Supabase invoice documents and ignores cancelled invoices.
- Material costs stay synchronized from `job_materials` via a database trigger.
- Workers may remove only material rows they themselves recorded on their assigned job.
- Supplier/material/order/item/movement company links are validated in the database.
- New materials with opening stock create an `initial` inventory movement.
- Wareneingang validates company consistency and remains protected against over-receipt.
- Bestellungen loads all order items so the total is complete.
- Additional positions can be added to an open purchase order.
