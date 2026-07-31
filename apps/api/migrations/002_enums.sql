CREATE TYPE user_role AS ENUM ('preparer', 'reviewer', 'admin');
CREATE TYPE period_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE normal_balance AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE journal_entry_source AS ENUM (
  'MANUAL', 'SALES', 'PURCHASE', 'CASH', 'ADJUSTMENT', 'CLOSING', 'DOCUMENT'
);
CREATE TYPE journal_entry_status AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
CREATE TYPE document_status AS ENUM (
  'UPLOADED', 'EXTRACTED', 'EXTRACTION_FAILED', 'APPROVED', 'REJECTED'
);
CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low');
CREATE TYPE audit_action AS ENUM (
  'CREATE', 'UPDATE', 'POST', 'REVERSE', 'APPROVE', 'REJECT',
  'CLOSE_PERIOD', 'REOPEN_PERIOD', 'LOGIN'
);
