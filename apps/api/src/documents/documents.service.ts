import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Confidence } from '@ledgerline/shared';
import { NotFoundError, ValidationError } from '../common/errors/domain-errors';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AccountsRepository } from '../accounts/accounts.repository';
import { PeriodsRepository } from '../periods/periods.repository';
import { JournalService } from '../journal/journal.service';
import { AuditService } from '../audit/audit.service';
import { ClaudeService } from '../intelligence/claude.service';
import { DocumentsRepository, DocumentRow } from './documents.repository';
import { StorageService } from './storage.service';
import { ApproveDocumentDto } from './dto/approve-document.dto';

const EXTRACTION_SYSTEM_PROMPT = `You are reading a supplier invoice, receipt or similar source document for a
Ghanaian bookkeeping practice. Reply with JSON only — no prose, no markdown code fences, no
commentary. Every field is nullable if it cannot be read from the document. Use this exact shape:

{
  "supplier": string | null,
  "documentNo": string | null,
  "documentDate": string | null,
  "currency": string | null,
  "lineItems": [{ "description": string, "amount": string }],
  "subtotal": string | null,
  "vat": string | null,
  "total": string | null,
  "paymentMethod": string | null,
  "confidence": {
    "supplier": "high" | "medium" | "low",
    "total": "high" | "medium" | "low"
  }
}

Amounts are decimal strings, e.g. "1234.50". Do not calculate or correct any figure — report
exactly what is printed on the document, even if a total looks wrong.`;

interface ExtractedDocument {
  supplier: string | null;
  documentNo: string | null;
  documentDate: string | null;
  currency: string | null;
  lineItems: { description: string; amount: string }[];
  subtotal: string | null;
  vat: string | null;
  total: string | null;
  paymentMethod: string | null;
  confidence: Record<string, Confidence>;
}

interface CodingSuggestion {
  accountId: string | null;
  reason: string;
  confidence: Confidence;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger('DocumentsService');

  constructor(
    private readonly documents: DocumentsRepository,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
    private readonly accounts: AccountsRepository,
    private readonly periods: PeriodsRepository,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  private static readonly SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  async upload(
    clientId: string,
    user: AuthenticatedUser,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<DocumentRow> {
    if (!DocumentsService.SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
      throw new ValidationError(
        `Unsupported file type "${file.mimetype}". Upload a photo or scan as JPEG, PNG or WebP.`,
      );
    }
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    const storagePath = `${clientId}/${randomUUID()}-${file.originalname}`;
    await this.storage.upload(storagePath, file.buffer, file.mimetype);
    return this.documents.create({
      clientId,
      storagePath,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileHash,
      uploadedBy: user.id,
    });
  }

  async list(clientId: string, status?: DocumentRow['status']) {
    return this.documents.list(clientId, status);
  }

  async getOne(clientId: string, id: string): Promise<DocumentRow> {
    const doc = await this.documents.findById(clientId, id);
    if (!doc) throw new NotFoundError('Document', id);
    return doc;
  }

  async getFile(clientId: string, id: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const doc = await this.getOne(clientId, id);
    const buffer = await this.storage.download(doc.storage_path);
    return { buffer, mimeType: doc.mime_type };
  }

  async extract(clientId: string, id: string): Promise<DocumentRow> {
    const doc = await this.getOne(clientId, id);

    // Re-extracting an identical file (same hash) is wasted spend — reuse a prior result.
    const cached = await this.documents.findExtractedByHash(clientId, doc.file_hash);
    if (cached && cached.id !== doc.id && cached.extracted) {
      return this.documents.markExtracted(id, cached.extracted, cached.extraction_raw ?? '');
    }

    if (!this.claude.isConfigured) {
      throw new ValidationError(
        'ANTHROPIC_API_KEY is not configured on this server. Document extraction is unavailable.',
      );
    }

    const buffer = await this.storage.download(doc.storage_path);
    const base64 = buffer.toString('base64');

    let extracted: ExtractedDocument | null = null;
    let rawText = '';
    try {
      const result = await this.claude.messages({
        system: EXTRACTION_SYSTEM_PROMPT,
        document: { base64, mediaType: doc.mime_type },
        tier: 'fast',
        purpose: 'document_extraction',
        clientId,
        documentId: id,
      });
      rawText = result.text;
      extracted = JSON.parse(this.stripCodeFence(result.text)) as ExtractedDocument;
    } catch (err) {
      this.logger.warn(`Extraction failed for document ${id}: ${(err as Error).message}`);
      return this.documents.markExtractionFailed(id, rawText || (err as Error).message);
    }

    const updated = await this.documents.markExtracted(id, extracted as unknown as Record<string, unknown>, rawText);
    await this.suggestAccount(clientId, updated, extracted);
    return this.getOne(clientId, id);
  }

  private stripCodeFence(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('```')) {
      return trimmed.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    }
    return trimmed;
  }

  private async suggestAccount(
    clientId: string,
    doc: DocumentRow,
    extracted: ExtractedDocument,
  ): Promise<void> {
    if (!this.claude.isConfigured) return;

    const expenseAccounts = await this.accounts.findAll(clientId, { type: 'EXPENSE', active: true });
    const recent = extracted.supplier
      ? await this.documents.recentApprovedForSupplier(clientId, extracted.supplier)
      : [];

    const system = `You are suggesting an expense account code for a Ghanaian bookkeeping practice. You
are given the extracted supplier and line item descriptions from a source document, the
client's chart of expense accounts, and up to twenty of this client's most recent approved
codings for the same supplier. Reply with JSON only, no prose, in this exact shape:
{ "accountId": string | null, "reason": string, "confidence": "high" | "medium" | "low" }
Pick accountId from the provided list of account ids only, or null if none fit.`;

    const userText = JSON.stringify({
      supplier: extracted.supplier,
      lineItems: extracted.lineItems,
      expenseAccounts: expenseAccounts.map((a) => ({ id: a.id, code: a.code, name: a.name })),
      recentCodingsForThisSupplier: recent.map((r) => r.suggested_account_id),
    });

    try {
      const result = await this.claude.messages({
        system,
        userText,
        tier: 'fast',
        purpose: 'document_coding',
        clientId,
        documentId: doc.id,
      });
      const suggestion = JSON.parse(this.stripCodeFence(result.text)) as CodingSuggestion;
      await this.documents.setSuggestion(doc.id, suggestion.accountId, suggestion.reason, suggestion.confidence);
    } catch (err) {
      this.logger.warn(`Account coding suggestion failed for document ${doc.id}: ${(err as Error).message}`);
    }
  }

  // Approval builds a DRAFT journal entry through the ordinary posting engine — this
  // module never writes to journal_lines itself. The audit row records both what the
  // model suggested and what the human actually chose, which is what lets accuracy be
  // measured later from the audit log rather than asserted.
  async approve(clientId: string, user: AuthenticatedUser, id: string, dto: ApproveDocumentDto) {
    const doc = await this.getOne(clientId, id);
    if (doc.status !== 'EXTRACTED') {
      throw new ValidationError('Only an extracted document can be approved');
    }

    const period = await this.periods.findContainingDate(clientId, dto.entryDate);
    if (!period) {
      throw new ValidationError(`No fiscal period covers ${dto.entryDate}`);
    }

    const entry = await this.journal.createDraft(clientId, user, {
      periodId: period.id,
      entryDate: dto.entryDate,
      narration: dto.narration,
      source: 'DOCUMENT',
      lines: [
        { accountId: dto.expenseAccountId, debit: dto.amount },
        { accountId: dto.paymentAccountId, credit: dto.amount },
      ],
    } as never);

    const updated = await this.documents.markApproved(id, entry.id);

    await this.audit.record({
      actorId: user.id,
      clientId,
      action: 'APPROVE',
      entityType: 'document',
      entityId: id,
      before: { suggestedAccountId: doc.suggested_account_id, suggestionReason: doc.suggestion_reason },
      after: { chosenAccountId: dto.expenseAccountId, resultingEntryId: entry.id },
    });

    return updated;
  }

  async reject(clientId: string, user: AuthenticatedUser, id: string, reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new ValidationError('A reason of at least a few words is required to reject a document');
    }
    const updated = await this.documents.markRejected(id, reason);
    await this.audit.record({
      actorId: user.id,
      clientId,
      action: 'REJECT',
      entityType: 'document',
      entityId: id,
      after: { reason },
    });
    return updated;
  }
}
