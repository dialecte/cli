import type { LotPlanEntry } from './plan-entry.types.ts'
import type { StackParent } from './stack.types.ts'
import type { LotOverlap, Refusal } from './store.types.ts'

export type BriefEffort = 'low' | 'medium' | 'high'

export type BriefStep = { title: string; spec: string; behaviours: string[] }

export type BriefLot = { paths: string[]; message: string }

/** A brief that passed every check that needs no file system and no git; its scope and lot paths are normalised. */
export type ParsedBrief = {
	schema: 1
	feature: string
	repository: string
	branch: string
	base: string
	goal: string
	plan: string
	scope: string[]
	steps: BriefStep[]
	lots: BriefLot[]
	effort: BriefEffort | undefined
	/** One public sentence a pull request may show; absent when the brief gives none. */
	summary?: string
	/** The issue the lot's pull request closes; absent when the brief gives none. */
	issue?: number
	/** Why the lot is kept on purpose from its start (KEEP 3.4): its first `keep` line; absent when the brief gives none. */
	keep?: string
}

/** What the git-free field checks return: the refusals, and the parsed brief only when there is none. */
export type BriefFieldsResult = { refused: Refusal[]; brief: ParsedBrief | undefined }

/** A brief that passed every check against the repository, the plan and the store. */
export type CheckedBrief = {
	/** The main checkout of the repository (a linked worktree given is replaced by it). */
	repository: string
	/** The base as given and the full commit it resolved to. */
	base: { ref: string; commit: string }
	branch: string
	feature: string
	goal: string
	/** The plan as read: its text, its bytes (copied as they are) and their sha256 hex. */
	plan: { text: string; bytes: Buffer; hash: string }
	/** The brief file's text, its bytes (copied as they are) and their sha256 hex. */
	briefText: string
	briefBytes: Buffer
	briefHash: string
	/** Normalised. */
	scope: string[]
	steps: BriefStep[]
	/** Paths normalised. */
	lots: BriefLot[]
	effort: BriefEffort | undefined
	/** One public sentence a pull request may show; absent when the brief gives none. */
	summary?: string
	/** The issue the lot's pull request closes; absent when the brief gives none. */
	issue?: number
	/** Why the lot is kept on purpose from its start (KEEP 3.4); absent when the brief gives none. */
	keep?: string
	/** The plan entry the lot carries out, when exactly one entry of the plans the machine knows is on its branch. */
	planEntry?: LotPlanEntry
	/** Whether the repository sits on a case-insensitive volume (probed, or the injected value). */
	caseInsensitive: boolean
	/** A simulated start's overlap and branch findings, which refused nothing; none for a real start. */
	wouldRefuse: Refusal[]
	/** The overlaps `--overlap-ok` accepted instead of refusing (each names its paths); none without it. */
	acceptedOverlaps: LotOverlap[]
	/** The overlaps the forecast cleared (the met lot's work reads; 33CO 4.2): the start goes ahead and names them. */
	clearedOverlaps: LotOverlap[]
	/** `lot start --on <lot>` (33CI CI4): the open lot the lot starts on, its branch and that branch's tip. */
	stackParent?: StackParent
}

/** `checked` is defined exactly when `refused` is empty. */
export type CheckBriefResult = {
	refused: Refusal[]
	checked: CheckedBrief | undefined
	/** `--on <lot>` naming no lot a child may start on (33CI CI4): its line, checked before every other fault. */
	stackRefusal?: string
}
