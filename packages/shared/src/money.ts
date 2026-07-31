import Decimal from 'decimal.js';

// Every amount in the application flows through here. Decimal.js avoids the binary
// floating point rounding that makes 0.1 + 0.2 !== 0.3 in plain JavaScript arithmetic,
// which is not acceptable in a ledger.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export class Money {
  private readonly value: Decimal;

  private constructor(value: Decimal) {
    this.value = value;
  }

  static of(amount: string | number | Money): Money {
    if (amount instanceof Money) return amount;
    return new Money(new Decimal(amount));
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  add(other: string | number | Money): Money {
    return new Money(this.value.plus(Money.of(other).value));
  }

  subtract(other: string | number | Money): Money {
    return new Money(this.value.minus(Money.of(other).value));
  }

  multiply(rate: string | number): Money {
    return new Money(this.value.times(rate));
  }

  negate(): Money {
    return new Money(this.value.negated());
  }

  isZero(): boolean {
    return this.round().value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.isZero();
  }

  equals(other: string | number | Money): boolean {
    return this.round().value.equals(Money.of(other).round().value);
  }

  compare(other: string | number | Money): -1 | 0 | 1 {
    return this.round().value.comparedTo(Money.of(other).round().value) as -1 | 0 | 1;
  }

  // Half up rounding to two decimal places, the accounting convention.
  round(): Money {
    return new Money(this.value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }

  toString(): string {
    return this.round().value.toFixed(2);
  }

  // Thousand separated, two decimal places, for display only. Parsing this string back
  // into a number is not supported on purpose.
  format(): string {
    const [whole, fraction] = this.toString().replace('-', '').split('.');
    const withSeparators = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const sign = this.isNegative() ? '-' : '';
    return `${sign}${withSeparators}.${fraction}`;
  }
}

export function sumMoney(amounts: (string | number | Money)[]): Money {
  return amounts.reduce<Money>((total, amount) => total.add(amount), Money.zero());
}
