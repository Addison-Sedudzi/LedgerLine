import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../config/config.service';
import { DatabaseService } from '../database/database.service';

// Checked against https://docs.claude.com/en/docs/about-claude/models/overview. 'fast' is
// the cheapest/quickest model, used for extraction and classification (structured-output
// tasks where the model is reading and categorising, not composing prose); 'strong' is
// used only where the task is actually writing something — narrative commentary. Every
// call defaults to 'fast'; a caller must explicitly ask for 'strong'.
export const MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  strong: 'claude-sonnet-5',
} as const;
export type ModelTier = keyof typeof MODELS;

export interface ClaudeCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

// The one wrapper every Claude API call in the codebase goes through. Nothing else touches
// the SDK directly. This is where the discipline in docs/ai-boundary.md is enforced in
// code: this class only ever returns text or JSON for a human to read and decide on. It has
// no method that writes to journal_entries or journal_lines, and it never will.
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger('ClaudeService');
  private readonly client: Anthropic | null;

  constructor(
    private readonly config: AppConfigService,
    private readonly db: DatabaseService,
  ) {
    const apiKey = this.config.anthropicApiKey;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  // Backs GET /ai/health: a real one-line round trip (not just "is a key present"), so a
  // wrong or revoked key shows up the same way a missing one does.
  async health(): Promise<{ configured: boolean; model?: string; text?: string; inputTokens?: number; outputTokens?: number }> {
    if (!this.client) return { configured: false };
    const result = await this.messages({
      system: 'Reply with exactly one word: OK.',
      userText: 'Health check.',
      tier: 'fast',
      maxTokens: 16,
      purpose: 'health_check',
    });
    return { configured: true, model: MODELS.fast, text: result.text, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  private async logUsage(
    purpose: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    clientId: string | null,
    documentId: string | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO claude_api_calls (client_id, purpose, model, input_tokens, output_tokens, document_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [clientId, purpose, model, inputTokens, outputTokens, documentId],
    );
  }

  private async callWithRetry(request: () => Promise<Anthropic.Message>): Promise<Anthropic.Message> {
    const delays = [1000, 3000];
    let lastError: unknown;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await request();
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number }).status;
        // A 400 means the request itself is wrong; retrying an identical request would
        // fail identically, so only rate limits and server errors are worth retrying.
        const retryable = status === 429 || (typeof status === 'number' && status >= 500);
        if (!retryable || attempt === delays.length) throw err;
        this.logger.warn(`Claude API call failed with status ${status}, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
    throw lastError;
  }

  async messages(params: {
    system: string;
    userText?: string;
    document?: { base64: string; mediaType: string };
    maxTokens?: number;
    tier?: ModelTier;
    purpose: string;
    clientId?: string | null;
    documentId?: string | null;
  }): Promise<ClaudeCallResult> {
    if (!this.client) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured. Document intelligence features are unavailable until it is set.',
      );
    }

    const content: Anthropic.MessageParam['content'] = [];
    if (params.document) {
      // Images only (jpeg/png/webp) for this build — scanned photos of receipts and
      // invoices, which is how this practice actually captures them. PDF support needs the
      // SDK's beta documents API and was cut to keep the integration surface small.
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: params.document.mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
          data: params.document.base64,
        },
      });
    }
    if (params.userText) {
      content.push({ type: 'text', text: params.userText });
    }

    const model = MODELS[params.tier ?? 'fast'];
    const response = await this.callWithRetry(() =>
      this.client!.messages.create({
        model,
        max_tokens: params.maxTokens ?? 2048,
        system: params.system,
        messages: [{ role: 'user', content }],
      }),
    );

    await this.logUsage(
      params.purpose,
      model,
      response.usage.input_tokens,
      response.usage.output_tokens,
      params.clientId ?? null,
      params.documentId ?? null,
    );

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return {
      text: textBlock?.text ?? '',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
