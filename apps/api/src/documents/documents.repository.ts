import { Injectable } from '@nestjs/common';
import { Confidence, DocumentStatus } from '@ledgerline/shared';
import { DatabaseService } from '../database/database.service';

export interface DocumentRow {
  id: string;
  client_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_hash: string;
  uploaded_by: string;
  uploaded_at: string;
  status: DocumentStatus;
  extracted: Record<string, unknown> | null;
  extraction_raw: string | null;
  suggested_account_id: string | null;
  suggestion_reason: string | null;
  confidence: Confidence | null;
  resulting_entry_id: string | null;
  rejected_reason: string | null;
}

@Injectable()
export class DocumentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: {
    clientId: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    fileHash: string;
    uploadedBy: string;
  }): Promise<DocumentRow> {
    const rows = await this.db.query<DocumentRow>(
      `INSERT INTO documents (client_id, storage_path, original_filename, mime_type, file_hash, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [input.clientId, input.storagePath, input.originalFilename, input.mimeType, input.fileHash, input.uploadedBy],
    );
    return rows[0];
  }

  async findById(clientId: string, id: string): Promise<DocumentRow | null> {
    const rows = await this.db.query<DocumentRow>('SELECT * FROM documents WHERE client_id = $1 AND id = $2', [
      clientId,
      id,
    ]);
    return rows[0] ?? null;
  }

  async findExtractedByHash(clientId: string, fileHash: string): Promise<DocumentRow | null> {
    const rows = await this.db.query<DocumentRow>(
      `SELECT * FROM documents WHERE client_id = $1 AND file_hash = $2 AND status IN ('EXTRACTED', 'APPROVED')
       ORDER BY uploaded_at DESC LIMIT 1`,
      [clientId, fileHash],
    );
    return rows[0] ?? null;
  }

  async list(clientId: string, status?: DocumentStatus): Promise<DocumentRow[]> {
    if (status) {
      return this.db.query<DocumentRow>(
        'SELECT * FROM documents WHERE client_id = $1 AND status = $2 ORDER BY uploaded_at ASC',
        [clientId, status],
      );
    }
    return this.db.query<DocumentRow>('SELECT * FROM documents WHERE client_id = $1 ORDER BY uploaded_at ASC', [
      clientId,
    ]);
  }

  async recentApprovedForSupplier(clientId: string, supplier: string, limit = 20): Promise<DocumentRow[]> {
    return this.db.query<DocumentRow>(
      `SELECT * FROM documents
       WHERE client_id = $1 AND status = 'APPROVED' AND extracted->>'supplier' = $2
       ORDER BY uploaded_at DESC LIMIT $3`,
      [clientId, supplier, limit],
    );
  }

  async markExtracted(
    id: string,
    extracted: Record<string, unknown>,
    raw: string,
  ): Promise<DocumentRow> {
    const rows = await this.db.query<DocumentRow>(
      `UPDATE documents SET status = 'EXTRACTED', extracted = $2, extraction_raw = $3 WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(extracted), raw],
    );
    return rows[0];
  }

  async markExtractionFailed(id: string, raw: string): Promise<DocumentRow> {
    const rows = await this.db.query<DocumentRow>(
      `UPDATE documents SET status = 'EXTRACTION_FAILED', extraction_raw = $2 WHERE id = $1 RETURNING *`,
      [id, raw],
    );
    return rows[0];
  }

  async setSuggestion(
    id: string,
    accountId: string | null,
    reason: string | null,
    confidence: Confidence | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE documents SET suggested_account_id = $2, suggestion_reason = $3, confidence = $4 WHERE id = $1`,
      [id, accountId, reason, confidence],
    );
  }

  async markApproved(id: string, resultingEntryId: string): Promise<DocumentRow> {
    const rows = await this.db.query<DocumentRow>(
      `UPDATE documents SET status = 'APPROVED', resulting_entry_id = $2 WHERE id = $1 RETURNING *`,
      [id, resultingEntryId],
    );
    return rows[0];
  }

  async markRejected(id: string, reason: string): Promise<DocumentRow> {
    const rows = await this.db.query<DocumentRow>(
      `UPDATE documents SET status = 'REJECTED', rejected_reason = $2 WHERE id = $1 RETURNING *`,
      [id, reason],
    );
    return rows[0];
  }
}
