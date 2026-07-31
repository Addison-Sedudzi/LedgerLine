import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfigService } from '../config/config.service';

const BUCKET = 'documents';

// Uploaded source documents (invoices, receipts) live in Supabase Storage, never on the
// API's own disk — the API is stateless and may run as several instances. This is the only
// class that talks to Storage; it uses the service role key, which never reaches the browser.
@Injectable()
export class StorageService {
  private readonly client: SupabaseClient;

  constructor(config: AppConfigService) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  }

  async upload(path: string, buffer: Buffer, mimeType: string): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) throw new Error(`Failed to upload document: ${error.message}`);
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error(`Failed to download document: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
}
