import type { FileCopiedSeam, LotExportJson } from '../../commands/lot-export.types.ts'

/** What an export did: the copy in place with its counts and the leftovers of other runs, or the file that failed. */
export type ExportOutcome = { exported: LotExportJson; leftovers: string[] } | { failed: string }

/** The call of `exportLot`: the lot folder (real path), the checked `<dir>` (real path), the test seam. */
export type ExportLotParams = {
	lotFolder: string
	dir: string
	afterFileCopied?: FileCopiedSeam
}

/** One file or link of the copy: its path relative to the copy, where its bytes come from. */
export type CopiedEntry = {
	path: string
	/** The source file, or the text the export writes (`cards.log`). */
	source: { file: string } | { text: string }
	/** `events.jsonl` of a live lot: the copy must be a prefix of the source. */
	prefix: boolean
}
