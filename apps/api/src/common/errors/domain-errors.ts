// Domain exceptions. Services throw these; nothing in a controller ever builds an error
// response by hand. A single exception filter (http-exception.filter.ts) maps each type to
// an HTTP status and a consistent JSON body.

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was not found`, 'NOT_FOUND', { entity, id });
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

export class UnbalancedEntryError extends DomainError {
  constructor(totalDebit: string, totalCredit: string) {
    super(
      `Entry does not balance: debits ${totalDebit} vs credits ${totalCredit}`,
      'UNBALANCED_ENTRY',
      { totalDebit, totalCredit, difference: (Number(totalDebit) - Number(totalCredit)).toFixed(2) },
    );
  }
}

export class PeriodClosedError extends DomainError {
  constructor(periodName: string) {
    super(`Period "${periodName}" is closed and does not accept postings`, 'PERIOD_CLOSED', {
      periodName,
    });
  }
}

export class ImmutableEntryError extends DomainError {
  constructor(entryId: string, reason = 'has already been posted') {
    super(`Journal entry ${entryId} ${reason} and cannot be changed`, 'IMMUTABLE_ENTRY', {
      entryId,
    });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You are not permitted to perform this action') {
    super(message, 'FORBIDDEN');
  }
}
