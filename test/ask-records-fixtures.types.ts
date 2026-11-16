import type { AskJson } from '../src/commands/ask.types.ts'
import type { AskState } from '../src/lib/knowledge/ask/ask.types.ts'

/** Where a slice id lies: its file and lines, as a hand-written pack's ranges are placed. */
export type GivenRange = { id: string; file: string; from: number; to: number }

/** A round of an ask as its `verdict.json` says: the round, the state it left the ask in, the fact it recorded. */
export type VerdictSpec = { round: number; state: AskState; fact: string | null }

/** An ask folder to write: its `ask.json` (what a case replaces of the base), its verdicts, its person's answer. */
export type AskFolderSpec = {
	ask: string
	json?: Partial<Pick<AskJson, 'state' | 'rung' | 'source' | 'fact'>>
	verdicts?: VerdictSpec[]
	/** The fact the person's answer recorded: an `answer.json` is written. */
	answer?: { fact: string }
	/** The fact of the person's confirmation of an ask the outside readers answered: a `confirm.json` is written. */
	confirm?: { fact: string }
}
