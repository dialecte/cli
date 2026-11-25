import type { CarrySourceLot } from './carry-workspace.types.ts'
import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** What the source lot of a rebuild did: its files at its red, then the files it rewrote before its green. */
export type CarryTddSource =
	| { red: Record<string, string>; green: Record<string, string> }
	/** Ordered runs of the source lot: the files written, then `tdd red` or `tdd green` (a red after a green is a rollback when the code goes back). */
	| { steps: CarryTddStep[] }
	/** A source with a ready-made ledger (the default of `writeCarrySource`) and, when given, a lot file; no test run. */
	| { canned: true; declaration?: string }

/** One run of the source lot. */
export type CarryTddStep = { files: Record<string, string>; run: 'red' | 'green' }

/** A vitest package of a canceled source lot and the lot rebuilt from it (or not), both with a real worktree. */
export type RebuiltLot = {
	start: StartWorkspace
	source: CarrySourceLot
	/** The rebuilt lot's folder in the store. */
	lotFolder: string
	/** The rebuilt lot's worktree: where `tdd` runs. */
	worktree: string
}
