import type { KeepOp } from '../src/lib/store/keep-decisions.types.ts'

/** A keep line of a case: its op, why, who and when (the cases' own values when left out). */
export type KeepLineSpec = { op?: KeepOp; reason?: string; by?: string; at?: string }

/** The items of a `worktree prune --json` plan, keyed `<kind> <name>`: the kept reason, or the command offered. */
export type WorktreePruneItems = Record<string, string>
