// Injectable clock — domain code never calls `new Date()` directly so tests can
// control time (token expiry, event timestamps, phase boundaries).

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export const systemClock: Clock = new SystemClock();
