CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- id matches the Supabase auth.users id, so the API trusts the JWT subject claim directly
-- without a separate mapping table.
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'preparer',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Which users may work on which clients. A practice may have several clients and a user
-- may work on more than one, so this is a many to many table rather than a column on users.
CREATE TABLE client_users (
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, user_id)
);

CREATE INDEX idx_client_users_user_id ON client_users (user_id);
