CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_hash text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users (id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status document_status NOT NULL DEFAULT 'UPLOADED',
  extracted jsonb,
  extraction_raw text,
  suggested_account_id uuid REFERENCES accounts (id),
  suggestion_reason text,
  confidence confidence_level,
  resulting_entry_id uuid REFERENCES journal_entries (id),
  rejected_reason text
);

CREATE INDEX idx_documents_client_id ON documents (client_id);
CREATE INDEX idx_documents_status ON documents (status);
-- Used to skip re-calling the Claude API for a file that has already been extracted.
CREATE INDEX idx_documents_client_hash ON documents (client_id, file_hash);

CREATE TABLE claude_api_calls (
  id bigserial PRIMARY KEY,
  client_id uuid REFERENCES clients (id),
  purpose text NOT NULL,
  model text NOT NULL,
  input_tokens int NOT NULL,
  output_tokens int NOT NULL,
  document_id uuid REFERENCES documents (id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
