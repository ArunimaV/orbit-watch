/** Noon US Eastern on Sunday, Oct 4, 2026. SL-8 DEB is that evening. */
export const DEFAULT_DEMO_NOW = "2026-10-04T16:00:00.000Z";

/**
 * Fixture-mode evaluation clock. An empty or invalid DEMO_NOW uses the default
 * so ranking and "tonight" stay put during judging.
 */
export function readDemoNow(envValue: string | undefined = process.env.DEMO_NOW): Date {
  const raw = envValue?.trim();
  if (!raw) return new Date(DEFAULT_DEMO_NOW);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date(DEFAULT_DEMO_NOW);
  return parsed;
}
