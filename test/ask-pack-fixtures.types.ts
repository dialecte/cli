import type { AskAngle, AskSlice, PoolSlice } from '../src/lib/knowledge/ask/ask.types.ts'
import type { AskCommandWorkspace } from './ask-command-workspace.types.ts'

/** What `askSliceOf` takes: an id, and whatever else of the slice the case pins. */
export type AskSliceOfParams = {
	id: string
	file?: string
	from?: number
	to?: number
	angles?: string[]
	score?: number
}

/** What `poolSliceOf` takes: an id and a family, and whatever else of the pool slice the case pins. */
export type PoolSliceOfParams = Pick<PoolSlice, 'id' | 'family'> &
	Partial<Pick<PoolSlice, 'counted' | 'quality' | 'angles' | 'file' | 'from' | 'to'>>

/** What `angleOf` takes. */
export type AngleOfParams = Pick<AskAngle, 'id' | 'family'>

/** A block of a file's quality, as `fileIndexOf` takes it. */
export type QualityBlockOf = {
	from: number
	to: number
	verdict: 'good' | 'poor' | 'unreadable'
}

/** The slices of a table of cases, by id. */
export type SliceTable = Record<string, AskSlice>

/** The ask a pack is made for: its workspace, its folder and its id. */
export type AskedForPack = {
	workspace: AskCommandWorkspace
	asksFolder: string
	ask: string
	sliceIds: string[]
	/** The angles of each slice the ask listed, in the same order. */
	sliceAngles: string[][]
	/** `--lot <folder>` when the ask lives in a hand-over folder, else nothing: given to every pack. */
	lotArgv: string[]
}

/** What `pack --json` prints, as far as the tests read it. */
export type PackJson = {
	schema: number
	ask: string
	round: number
	state: string
	readers: { letter: string; brief: string; slices: string[] }[]
	next: string | null
}

/** What a reader's `.json` brief holds, as far as the tests read it. */
export type BriefJson = {
	ask: string
	round: number
	reader: string
	nonce: string
	question: string
	outside: { name: string | null; web: boolean } | null
	slices: { id: string; file: string; from: number; to: number; quality: string }[]
}
