/** The counts the bench keeps of one scenario: deterministic with one checker. */
export type Counts = { Instantiations: number; Types: number; Symbols: number }

/** The counts of one tree: per version, per scenario. */
export type TreeCounts = Record<string, Record<string, Counts>>

/** The compiler a bench ran with: `tsgo` for TypeScript 7 and later (the native one), `tsc` below. */
export type Compiler = { name: 'tsgo' | 'tsc'; version: string }

/** What both trees are measured with: the head's compiler binary and what it says it is. */
export type Ruler = { compiler: Compiler; tsc: string }

/** What `measureTree` measured: the counts, and the versions whose method discovery failed (named, with why). */
export type TreeMeasure = { counts: TreeCounts; discoveryFailures: string[] }
