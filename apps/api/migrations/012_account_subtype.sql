-- Sub-classification within an account's type, used to build financial statement sections
-- (current vs non-current on the balance sheet, cost of sales vs operating expense on the
-- income statement). Nullable — income and equity accounts don't use it in this build.
CREATE TYPE account_subtype AS ENUM (
  'CURRENT_ASSET', 'NON_CURRENT_ASSET',
  'CURRENT_LIABILITY', 'NON_CURRENT_LIABILITY',
  'COST_OF_SALES', 'OPERATING_EXPENSE'
);

ALTER TABLE accounts ADD COLUMN subtype account_subtype;

-- Defense in depth, matching accounts_normal_balance_matches_type: the database refuses to
-- store a subtype that doesn't belong to the account's own type, even if application code
-- forgets to check.
ALTER TABLE accounts ADD CONSTRAINT accounts_subtype_matches_type CHECK (
  subtype IS NULL
  OR (type = 'ASSET' AND subtype IN ('CURRENT_ASSET', 'NON_CURRENT_ASSET'))
  OR (type = 'LIABILITY' AND subtype IN ('CURRENT_LIABILITY', 'NON_CURRENT_LIABILITY'))
  OR (type = 'EXPENSE' AND subtype IN ('COST_OF_SALES', 'OPERATING_EXPENSE'))
);

-- Sensible per-type defaults for every account that already exists, so nothing is left
-- unclassified. Assets get a small name-based heuristic for the handful of genuinely
-- non-current items already in the seed chart (vehicles, furniture, depreciation);
-- everything else defaults to the common case and can be corrected on the Chart of
-- Accounts page.
UPDATE accounts SET subtype = 'OPERATING_EXPENSE' WHERE type = 'EXPENSE';
UPDATE accounts SET subtype = 'CURRENT_LIABILITY' WHERE type = 'LIABILITY';
UPDATE accounts SET subtype = 'NON_CURRENT_ASSET'
  WHERE type = 'ASSET' AND name ~* '(vehicle|furniture|equipment|building|land|depreciation)';
UPDATE accounts SET subtype = 'CURRENT_ASSET' WHERE type = 'ASSET' AND subtype IS NULL;
