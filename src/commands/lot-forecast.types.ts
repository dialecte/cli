import type { ForecastLine, ForecastVerdict } from '../lib/coordination/forecast.types.ts'

/** What `lot forecast --json` prints: the lot, its worst verdict, the lines of the run it appended. */
export type LotForecastJson = { lot: string; verdict: ForecastVerdict; lines: ForecastLine[] }
