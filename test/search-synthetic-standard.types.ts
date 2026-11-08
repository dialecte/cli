import type { SyntheticBlock } from './synthetic-standard.types.ts'

/** One file of a synthetic standard: its id (the synthetic file id when left out) and its blocks. */
export type SyntheticFile = {
	fileId?: string
	blocks: SyntheticBlock[]
}
