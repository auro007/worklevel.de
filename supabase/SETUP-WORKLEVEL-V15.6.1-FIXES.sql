-- WORKLEVEL V15.6.1 - regression fixes
-- Additive/idempotent. No reset. Historical documents/job snapshots are NOT rewritten.

-- Repair only clearly malformed CURRENT material-master units.
-- POSIX classes avoid backslash/standard_conforming_strings ambiguity.
update public.inventory_materials
set unit = 'Stk.', updated_at = now()
where coalesce(unit, '') ~ '^[[:space:]]*[0-9]+([.,][0-9]+)?[[:space:]]*$'
   or coalesce(unit, '') ~* '^[[:space:]]*stk\.?[0-9]+([.,][0-9]+)?[[:space:]]*$';
