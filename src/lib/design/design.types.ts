import type { PlanEntry, PlanEntryKind } from '../plan/plan-block.types.ts'
import type {
	DESIGN_FILE_REFUSALS,
	DESIGN_GATE_VERBS,
	DESIGN_STATES,
	VERDICT_CAUSES,
	VERDICT_STANDING_STATES,
	VERDICT_WORDS,
} from './design.constants.ts'

/**
 * Why a lot needs a design: a path of its scope (or of a commit) in a shared area its repository declares
 * (`dialecte.risk.high`), or a scope broader than one; or the plan entry it carries out is of kind `lot`.
 */
export type DesignNeedReason = { kind: 'shared'; glob: string; path: string } | { kind: 'entry' }

/** Whether a lot needs a design, and why. */
export type DesignNeed = { required: boolean; reasons: DesignNeedReason[] }

/** What the need is read from: the plan entry's kind, the declared shared areas, the paths the lot reaches. */
export type DesignNeedInput = {
	entryKind: PlanEntryKind | undefined
	declaredHigh: readonly string[]
	paths: readonly string[]
}

/** A design recorded: its real path, the sha256 of its bytes, and whether it came from a file or the plan's spec. */
export type DesignRecordedLine = {
	schema: 1
	kind: 'recorded'
	at: string
	file: string
	hash: string
	from: 'file' | 'plan'
}

/** An approval of one recorded content, for the need it was given against. */
export type DesignApprovedLine = {
	schema: 1
	kind: 'approved'
	at: string
	by: string
	reason?: string
	hash: string
	need: DesignNeedReason[]
	/** The saved reviews the approval rests on (absent on approvals recorded before reviews were read). */
	reviews?: DesignReview[]
}

/** A saved review an approval rests on: its file's basename and the sha256 of the bytes read. */
export type DesignReview = { name: string; hash: string }

/** A required lot let go without a design, for the need it was given against. */
export type DesignWaivedLine = {
	schema: 1
	kind: 'waived'
	at: string
	by: string
	reason: string
	need: DesignNeedReason[]
}

/** A line of a lot folder's `design.jsonl`. */
export type DesignLine = DesignRecordedLine | DesignApprovedLine | DesignWaivedLine

/** Where a lot's design stands. */
export type DesignStateName = (typeof DESIGN_STATES)[number]

/** The recorded file as it is now: the sha256 of its bytes, or undefined when it is gone. */
export type DesignSourceHash = string | undefined

/** A lot's design standing: the need, the state, who approved or waived, the reasons a go-ahead does not cover. */
export type DesignStanding = {
	need: DesignNeed
	state: DesignStateName
	/** The approver or the waiver's `--by` (private: a view renders its kind). */
	by?: string
	/** The current reasons the last approval of the recorded content, or the last waiver, was not given against. */
	uncovered: DesignNeedReason[]
	/** The last recorded design's real path and hash. */
	file?: string
	hash?: string
}

/** A lot's design standing as `--json` prints it: who approved or waived by kind only. */
export type DesignStatusJson = {
	required: boolean
	reasons: DesignNeedReason[]
	state: DesignStateName
	by: string | null
	uncovered: DesignNeedReason[]
}

/** A plan entry as its block holds it, and how many `lot` or `fix` entries of the block name its spec. */
export type HeldPlanEntry = { entry: PlanEntry; sharing: number }

/** A verb the design gate holds. */
export type DesignGateVerb = keyof typeof DESIGN_GATE_VERBS

/** The gate's answer: the standing it read, and the refusal when the design does not let the lot go on. */
export type DesignGate = { standing: DesignStanding; refusal?: string }

/** Why a design or review file is refused (or, in a folder scan, skipped). */
export type DesignFileRefusalKind = (typeof DESIGN_FILE_REFUSALS)[number]

/** A design or review file read once: its real path, its bytes and its text. */
export type DesignFileContent = { file: string; bytes: Buffer; text: string }

/** A design or review file refused, and why. */
export type DesignFileRefusal = { refused: DesignFileRefusalKind; file: string }

/** How a review's last `Verdict:` line reads. */
export type VerdictWord = (typeof VERDICT_WORDS)[number]

/** What a review file says: the design hashes its `Design:` lines name, and its verdict when it holds one. */
export type VerdictRead = {
	/** Each named hash prefix, lower case. */
	designs: string[]
	/** The verdict; an unrecognized one says why (`cause`). */
	verdict?: { word: VerdictWord; written: string; cause?: VerdictCause }
}

/** Why a review's verdict is unrecognized: its lines disagree, a fence is left open, or its word is neither. */
export type VerdictCause = (typeof VERDICT_CAUSES)[number]

/** A review file read once: its real path, basename, the sha256 and text of the bytes read, and what it says. */
export type VerdictFile = {
	file: string
	name: string
	hash: string
	text: string
	read: VerdictRead
}

/** Where the reviews of a recorded hash stand. */
export type VerdictStandingState = (typeof VERDICT_STANDING_STATES)[number]

/**
 * The reviews of a recorded hash: the READY files naming it, the files naming it with another verdict, the READY
 * files naming only an earlier recorded hash, and the files naming it without a verdict.
 */
export type VerdictStanding = {
	state: VerdictStandingState
	ready: VerdictFile[]
	blocking: VerdictFile[]
	earlierReady: { name: string; hash: string }[]
	noVerdict: string[]
}

/**
 * The reviews an approval reads: the scanned folder's and the named files together (the folder `gone` when it is),
 * the named files refused, those naming another hash, those naming it without a verdict, and the standing.
 */
export type DesignReviews = {
	folder: 'read' | 'gone'
	refusals: DesignFileRefusal[]
	/** The real paths of named files that name no design of the recorded hash. */
	namesOther: string[]
	/** The real paths of named files that name it without a `Verdict:` line. */
	namedNoVerdict: string[]
	standing: VerdictStanding
}

/** A raw review line as a fence reads it: its indentation in spaces and the rest, trimmed. */
export type FenceLine = { indent: number; rest: string }

/** The fence a review holds open: its character and the length of its opening run. */
export type OpenFence = { character: string; length: number }

/** One read `Verdict:` line of a review: its word, its value as written, and whether a quote marker led it. */
export type ReadVerdictLine = { word: VerdictWord; written: string; quoted: boolean }
