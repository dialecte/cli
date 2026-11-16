import type { AskJson } from './ask-command-workspace.types.ts'
import type { AskedForPack } from './ask-pack-fixtures.types.ts'
import type { PackedForVerdict, CitedClause } from './ask-verdict-fixtures.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'

/** What `ask answer --json` prints, as far as the tests read it. */
export type AnswerJson = {
	schema: number
	ask: string
	fact: string
	miss: { given: boolean; round: number | null } | null
	citeRefused: string | null
}

/** An ask over two clauses: which clause the slice of round 1 holds, and the asks's `--json`. */
export type AskedOverClauses = {
	asked: AskedForPack
	/** The clause the first slice of the ask holds: the one `writeRoundOne` gives in round 1. */
	roundOneClause: CitedClause
	json: AskJson
}

/** An ask kept with a store lot: its workspace, the lot's workspace and folder. */
export type LotAsked = AskedForPack & { lotFolder: string; lots: BriefWorkspace }

/** An outside ask of a store lot whose round is open: packed for the verdict, with its lot. */
export type PackedInLot = PackedForVerdict & { lotFolder: string; lots: BriefWorkspace }

/** What `ask answer` is given: the text, the person, and what else the case pins. */
export type PersonAnswerParams = {
	asked: AskedForPack
	text?: string
	/** The person (`person-a` unless said); null leaves `--by` off the command line. */
	by?: string | null
	/** The words after the person, as written on the command line. */
	argv?: string[]
}
