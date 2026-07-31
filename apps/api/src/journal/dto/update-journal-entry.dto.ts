import { PartialType } from '@nestjs/mapped-types';
import { CreateJournalEntryDto } from './create-journal-entry.dto';

// Only ever applied to a DRAFT entry — the service enforces that, not this DTO.
export class UpdateJournalEntryDto extends PartialType(CreateJournalEntryDto) {}
