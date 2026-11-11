import type { StationLot } from './lot-station-workspace.types.ts'

/** A lot of a scratch store, ready to export, and the folder it goes to. */
export type ExportLot = {
	lot: StationLot
	/** An existing folder outside every repository (real path). */
	dir: string
	/** The registry entry file of the lot, as the store wrote it. */
	entryFile: string
	/** The `cards.log` lines of the lot, as written. */
	lotLines: string[]
	/** The `cards.log` lines of the other lot, as written. */
	otherLines: string[]
}

/** What a path of a tree is: a folder, a file (size, sha256, permission bits) or a link (its target). */
export type TreeEntry =
	| { kind: 'folder'; mode: number }
	| { kind: 'file'; size: number; sha256: string; mode: number }
	| { kind: 'link'; target: string }
