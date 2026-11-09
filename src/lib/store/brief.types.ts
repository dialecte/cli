import type { Refusal } from './store.types.ts'

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
	/** Whether the repository sits on a case-insensitive volume (probed, or the injected value). */
	caseInsensitive: boolean
	/** A simulated start's overlap and branch findings, which refused nothing; none for a real start. */
	wouldRefuse: Refusal[]
}

/** `checked` is defined exactly when `refused` is empty. */
export type CheckBriefResult = { refused: Refusal[]; checked: CheckedBrief | undefined }
