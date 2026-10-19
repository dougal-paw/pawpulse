export interface Env {
  DB: D1Database;
  ALERTS_ENABLED: string;
  RATE_LIMIT_PER_MINUTE: string;
  /** Public origin used in docs, commands and rel=canonical, e.g. https://pulse.dougalpaw.com. Falls back to the request origin. */
  CANONICAL_ORIGIN?: string;
}
