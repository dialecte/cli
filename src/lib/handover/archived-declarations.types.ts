/** The archive of the lot files a hand-over folder keeps: its names, the per-file decision, what a reader gets. */
import type { ARCHIVE_NAMES } from './archived-declarations.constants.ts'

/** An archive file's name: `lot.json`, or `lot.landed.json` when `lot.json` holds other bytes. */
export type ArchiveName = (typeof ARCHIVE_NAMES)[number]

/**
 * What one lot file gets: `untouched` (not this run's own: never copied, never emptied), `nothing` (an empty
 * declaration), `write` (archived under `name`, then emptied), `already` (an archive holds its bytes: emptied),
 * `keep` (both archives hold other bytes: left as it is).
 */
export type ArchiveDecision =
	| { kind: 'untouched' }
	| { kind: 'nothing' }
	| { kind: 'write'; name: ArchiveName }
	| { kind: 'already'; name: ArchiveName }
	| { kind: 'keep' }

/** The texts one decision reads: the lot file's, and the folder's two archives of its package path. */
export type ArchiveDecisionParams = {
	/** The lot file as it stands. */
	bytes: string
	/** The folder's `lot.json` of that package path; undefined when absent. */
	archived: string | undefined
	/** The folder's `lot.landed.json` of that package path; undefined when absent. */
	landed: string | undefined
	/**
	 * Whether the lot file is the declaration of the lot being archived: a hand-over run that committed lots, or
	 * bytes the folder's pending record names.
	 */
	owned: boolean
}

/** An archived declaration of a folder. */
export type ArchivedDeclaration = {
	/** `''` for the root's. */
	packagePath: string
	name: ArchiveName
	/** Its absolute path. */
	path: string
	bytes: string
}

/** What `moveDeclarations` did to one lot file. */
export type MovedDeclaration = {
	packagePath: string
	/** The lot file's absolute path. */
	file: string
	decision: ArchiveDecision
	/** The archive written (`write`) or matched (`already`); the `lot.json` path otherwise. */
	archive: string
	/** Whether the lot file declared nothing. */
	empty: boolean
	/** Why the archive was not written or does not read back: the lot file is left as it is, recorded as pending. */
	failure?: string
}

/** A lot file a move failed to archive, as the folder's pending record holds it. */
export type PendingArchive = {
	packagePath: string
	/** The sha256 of the lot file's bytes when the move failed. */
	sha256: string
}

/** A lot file's declaration to archive before a worktree goes: where, and its bytes. */
export type DeclarationArchive = { path: string; bytes: string }

/** A package whose lot file nothing archives: both of its archives hold other bytes. */
export type KeptDeclaration = {
	/** The lot file, relative to the worktree. */
	file: string
	/** Its `lot.json` archive. */
	archived: string
	/** Its `lot.landed.json` archive. */
	landed: string
}

/** A lot file as a close decided on it: its absolute path and the bytes read then. */
export type ReadDeclaration = { file: string; bytes: string }

/**
 * What a close keeps of a worktree's lot files, decided before anything moves: the bytes the removal rule counts as
 * archived, the lot files those bytes were read from (read again before the move), the archives to write before the
 * move, and the lot files nothing archives (each keeps the worktree).
 */
export type ClosingDeclarations = {
	counted: CountedArchive[]
	read: ReadDeclaration[]
	archives: DeclarationArchive[]
	kept: KeptDeclaration[]
}

/** One archived declaration's bytes under its package path, as the removal rule counts it. */
export type CountedArchive = {
	packagePath: string
	bytes: Buffer
}

/** A lot file judged by the removal rule: its package path, its bytes, and every archive counted for the worktree. */
export type RemovableDeclarationParams = {
	packagePath: string
	bytes: Buffer
	archives: readonly CountedArchive[]
}
