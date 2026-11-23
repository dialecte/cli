/** The types of the hook's tdd step (`hook-tdd.ts`). */

/** A closed case not proven at the production committed: its line, and whether only a red can prove it. */
export type StaleCase = { line: string; needsRed: boolean }
