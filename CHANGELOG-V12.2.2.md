# WORKLEVEL V12.2.2

Stability repair for upgraded V12 databases.

- Removes all leftover triggers using the obsolete `enforce_procurement_company_links()` function.
- Drops the obsolete generic trigger function after cleanup.
- Recreates dedicated company guard functions for materials, purchase orders, purchase order items, and inventory movements.
- Adds migration verification that aborts if the obsolete trigger is still attached.
- Preserves existing business rows.
