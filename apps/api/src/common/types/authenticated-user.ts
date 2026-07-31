import { UserRole } from '@ledgerline/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}
