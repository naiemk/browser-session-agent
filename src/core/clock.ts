/**
 * Injectable time. Jobs and leases must not sleep on the wall clock in tests.
 */
export interface Clock {
  now(): Date;
  nowMs(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
};

export function iso(clock: Clock = systemClock): string {
  return clock.now().toISOString();
}

/** Manual clock for tests. Advance instead of sleeping. */
export class FakeClock implements Clock {
  constructor(private ms: number = Date.parse("2026-09-07T12:00:00.000Z")) {}

  now(): Date {
    return new Date(this.ms);
  }

  nowMs(): number {
    return this.ms;
  }

  advance(ms: number): void {
    this.ms += ms;
  }

  set(isoTime: string): void {
    this.ms = Date.parse(isoTime);
  }
}
