-- Account deletion (AccountsService.delete) now writes a DELETE audit record — see the
-- accounts module's delete flow — but the audit_action enum never had a DELETE value, so
-- every account delete crashed the whole request with a raw enum-violation error instead of
-- succeeding. Only ever adds the value here, never uses it in the same transaction (the
-- migration runner wraps this file in BEGIN/COMMIT, and Postgres still forbids using a
-- value added by ALTER TYPE ... ADD VALUE within the transaction that added it).
ALTER TYPE audit_action ADD VALUE 'DELETE';
