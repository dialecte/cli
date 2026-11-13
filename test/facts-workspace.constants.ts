/** The clock of the facts a command test records. */
export const FACTS_NOW = new Date('2026-11-11T10:00:00.000Z')

/** A reason longer than a history line may keep, for the cut at 200 characters. */
export const LONG_REASON = 'x'.repeat(250)

/** The most characters a reason keeps before its history line. */
export const REASON_LIMIT = 200
