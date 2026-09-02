-- One-off data fix: "Bank" was created with type EXPENSE and code 5000, putting it in the
-- expense numbering block even though a bank account is an asset. It has zero postings, so
-- reclassifying it does not reinterpret any transaction history (compare
-- AccountsService.update, which refuses to change a type once an account has postings, for
-- exactly this reason). Renumbered to 1010, the next free code in the asset block for this
-- client (1000 is already taken by "debtor").
UPDATE accounts
SET type = 'ASSET', normal_balance = 'DEBIT', code = '1010'
WHERE id = 'e1bd987e-89ab-48c8-a6ed-6dd1c4e77ad9'
  AND code = '5000' AND type = 'EXPENSE';
