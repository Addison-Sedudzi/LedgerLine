import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { Env } from './env.validation';

// Wraps @nestjs/config with typed getters so process.env is read in exactly one place.
@Injectable()
export class AppConfigService {
  constructor(private readonly nest: NestConfigService<Env, true>) {}

  get databaseUrl(): string {
    return this.nest.get('DATABASE_URL', { infer: true });
  }

  get supabaseUrl(): string {
    return this.nest.get('SUPABASE_URL', { infer: true });
  }

  get supabaseAnonKey(): string {
    return this.nest.get('SUPABASE_ANON_KEY', { infer: true });
  }

  get supabaseServiceRoleKey(): string {
    return this.nest.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
  }

  get supabaseJwtSecret(): string {
    return this.nest.get('SUPABASE_JWT_SECRET', { infer: true });
  }

  get anthropicApiKey(): string | undefined {
    return this.nest.get('ANTHROPIC_API_KEY', { infer: true });
  }

  get port(): number {
    return this.nest.get('PORT', { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.nest.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
}
