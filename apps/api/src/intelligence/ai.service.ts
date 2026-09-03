import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { AppConfigService } from '../config/config.service';
import { DatabaseService } from '../database/database.service';

// Checked against https://developers.openai.com/api/docs/models. 'fast' is the
// cost-sensitive, high-volume model, used for extraction and classification (structured-
// output tasks where the model is reading and categorising, not composing prose); 'strong'
// is used only where the task is actually writing something — narrative commentary. Every
// call defaults to 'fast'; a caller must explicitly ask for 'strong'.
export const MODELS = {
  fast: 'gpt-5.6-luna',
  strong: 'gpt-5.6-sol',
} as const;
export type ModelTier = keyof typeof MODELS;

export interface AiCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

// The one wrapper every OpenAI API call in the codebase goes through. Nothing else touches
// the SDK directly. This is where the discipline in docs/ai-boundary.md is enforced in
// code: this class only ever returns text or JSON for a human to read and decide on. It has
// no method that writes to journal_entries or journal_lines, and it never will.
@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService');
  private readonly client: OpenAI | null;

  constructor(
    private readonly config: AppConfigService,
    private readonly db: DatabaseService,
  ) {
    const apiKey = this.config.openaiApiKey;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
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
      `INSERT INTO ai_api_calls (client_id, purpose, model, input_tokens, output_tokens, document_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [clientId, purpose, model, inputTokens, outputTokens, documentId],
    );
  }

  private async callWithRetry(
    request: () => Promise<OpenAI.Chat.Completions.ChatCompletion>,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
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
        this.logger.warn(`OpenAI API call failed with status ${status}, retrying...`);
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
    // A hard per-call budget. Document extraction (a background action) leaves this
    // unset and takes the SDK's own default; a UI-latency-sensitive caller like the
    // account-suggestion ghost text sets one explicitly so a slow response can never hang
    // the input — it just fails fast and no suggestion is shown.
    timeoutMs?: number;
    purpose: string;
    clientId?: string | null;
    documentId?: string | null;
  }): Promise<AiCallResult> {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY is not configured. AI features are unavailable until it is set.');
    }

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    if (params.document) {
      // Images only (jpeg/png/webp) for this build — scanned photos of receipts and
      // invoices, which is how this practice actually captures them. PDF support would
      // need a separate extraction step and was cut to keep the integration surface small.
      content.push({
        type: 'image_url',
        image_url: { url: `data:${params.document.mediaType};base64,${params.document.base64}` },
      });
    }
    if (params.userText) {
      content.push({ type: 'text', text: params.userText });
    }

    const model = MODELS[params.tier ?? 'fast'];
    const response = await this.callWithRetry(() =>
      this.client!.chat.completions.create(
        {
          model,
          max_completion_tokens: params.maxTokens ?? 2048,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content },
          ],
        },
        params.timeoutMs ? { timeout: params.timeoutMs } : undefined,
      ),
    );

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    await this.logUsage(params.purpose, model, inputTokens, outputTokens, params.clientId ?? null, params.documentId ?? null);

    return {
      text: response.choices[0]?.message?.content ?? '',
      inputTokens,
      outputTokens,
    };
  }
}
