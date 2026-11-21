/**
 * The one archive rule of a hand-over folder's lot files: where each package's declaration is archived, the
 * per-file decision, the move `handover run` makes, and the reader of what a folder holds.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { lotFilesOf } from '../worktree/lot-files.ts'
import {
	ARCHIVE_NAMES,
	ARCHIVE_PENDING_FILE,
	ARCHIVE_READ_BACK_DIFFERS,
	LANDED_LOT_FILE,
	PACKAGE_ARCHIVES_FOLDER,
} from './archived-declarations.constants.ts'
import { ARCHIVED_LOT_FILE, EMPTY_LOT_DECLARATION } from './handover.constants.ts'
import { isEmptyDeclaration } from './is-empty-declaration.ts'

import type {
	ArchiveDecision,
	ArchiveDecisionParams,
	ArchivedDeclaration,
	ArchiveName,
	MovedDeclaration,
	DeclarationArchive,
	ClosingDeclarations,
	PendingArchive,
	RemovableDeclarationParams,
} from './archived-declarations.types.ts'

/**
 * `<folder>/<name>` for the root, `<folder>/lots/<package path>/<name>` for a package.
 * @intent locate a package's archived declaration in a hand-over or lot folder
 */
export function archivedDeclarationPath(params: {
	folder: string
	packagePath: string
	name: ArchiveName
}): string {
	const { folder, packagePath, name } = params
	return packagePath === ''
		? join(folder, name)
		: join(folder, PACKAGE_ARCHIVES_FOLDER, packagePath, name)
}

/**
 * The decision for one lot file: never one the lot does not own; an empty one has nothing to keep; else
 * `lot.json`, then `lot.landed.json` when `lot.json` holds other bytes, never over an archive.
 * @intent decide whether and where a lot file is archived
 */
export function archiveDecision(params: ArchiveDecisionParams): ArchiveDecision {
	const { bytes, archived, landed } = params
	if (!params.owned) return { kind: 'untouched' }
	if (isEmptyDeclaration(bytes)) return { kind: 'nothing' }
	if (archived === undefined) return { kind: 'write', name: ARCHIVED_LOT_FILE }
	if (archived === bytes) return { kind: 'already', name: ARCHIVED_LOT_FILE }
	if (landed === undefined) return { kind: 'write', name: LANDED_LOT_FILE }
	if (landed === bytes) return { kind: 'already', name: LANDED_LOT_FILE }
	return { kind: 'keep' }
}

/**
 * The archive a reader takes for one package path: `lot.landed.json` when present (the declaration the lot
 * landed with), else `lot.json`; undefined when the folder holds neither.
 * @intent read the current archived declaration of a package
 */
export function currentArchiveOf(params: {
	folder: string
	packagePath: string
}): ArchivedDeclaration | undefined {
	return [...ARCHIVE_NAMES]
		.reverse()
		.map((name) => archiveOf({ ...params, name }))
		.find((archive) => archive !== undefined)
}

/**
 * Whether a lot file goes with its worktree: it declares nothing, or it is byte-equal to an archive of its own
 * package path.
 * @intent decide whether the removal rule lets a lot file go
 */
export function isRemovableDeclaration(params: RemovableDeclarationParams): boolean {
	const { packagePath, bytes } = params
	return (
		isEmptyDeclaration(bytes.toString('utf8')) ||
		params.archives.some(
			(archive) => archive.packagePath === packagePath && archive.bytes.equals(bytes),
		)
	)
}

/**
 * Every archived declaration of a folder: the root's and each package's under `lots/`, both names, by package
 * path then name.
 * @intent list what a hand-over or lot folder archived
 */
export function archivedDeclarationsOf(params: { folder: string }): ArchivedDeclaration[] {
	const { folder } = params
	const packagesFolder = join(folder, PACKAGE_ARCHIVES_FOLDER)
	const packagePaths = existsSync(packagesFolder)
		? readdirSync(packagesFolder, { recursive: true, withFileTypes: true })
				.filter((entry) => entry.isFile() && isArchiveName(entry.name))
				.map((entry) => relative(packagesFolder, entry.parentPath).split(sep).join('/'))
		: []
	return ['', ...new Set(packagePaths)]
		.sort()
		.flatMap((packagePath) =>
			ARCHIVE_NAMES.flatMap((name) => archiveOf({ folder, packagePath, name }) ?? []),
		)
}

/**
 * Every lot file of the worktree through `archiveDecision`, archived into `folder`, read back, then emptied when
 * archived or already archived; the others left as they are. A lot file is owned when `owned` (the run committed
 * lots) or when the folder's pending record names its package path with these bytes. A write or read-back that
 * fails leaves that file as it is, names why, and goes on; the failures are the folder's new pending record (none:
 * the record removed).
 * @intent archive a committed hand-over's lot files
 */
export function moveDeclarations(params: {
	worktree: string
	folder: string
	owned: boolean
	/** The commits the lot files' packages may have been deleted by start from: their packages are found too. */
	bases?: readonly string[]
}): MovedDeclaration[] {
	const { folder } = params
	const pending = readPendingArchives(folder)
	const moved = lotFilesOf({ root: params.worktree, bases: params.bases }).map(
		function moveDeclaration(lotFile): MovedDeclaration {
			const { packagePath, file } = lotFile
			const bytes = readFileSync(file, 'utf8')
			const digest = sha256Of(bytes)
			const decision = archiveDecision({
				bytes,
				archived: archiveOf({ folder, packagePath, name: ARCHIVED_LOT_FILE })?.bytes,
				landed: archiveOf({ folder, packagePath, name: LANDED_LOT_FILE })?.bytes,
				owned:
					params.owned ||
					pending.some((entry) => entry.packagePath === packagePath && entry.sha256 === digest),
			})
			const stored = decision.kind === 'write' || decision.kind === 'already'
			const archive = archivedDeclarationPath({
				folder,
				packagePath,
				name: stored ? decision.name : ARCHIVED_LOT_FILE,
			})
			const outcome = { packagePath, file, decision, archive, empty: isEmptyDeclaration(bytes) }
			const failure = decision.kind === 'write' ? writeArchive({ archive, bytes }) : undefined
			if (failure) return { ...outcome, failure }
			if (stored) writeFileSync(file, EMPTY_LOT_DECLARATION)
			return outcome
		},
	)
	writePendingArchives({
		folder,
		pending: moved.flatMap((declaration) =>
			declaration.failure
				? [
						{
							packagePath: declaration.packagePath,
							sha256: sha256Of(readFileSync(declaration.file, 'utf8')),
						},
					]
				: [],
		),
	})
	return moved
}

/**
 * Every lot file of the worktree through `archiveDecision` against `folder`'s archives of its package path, nothing
 * written and nothing emptied (the worktree goes): an archived or empty one counted, with the archive to write before
 * the move when none holds its bytes; one whose two archives hold other bytes kept, named; one not `owned` left to
 * the removal rule.
 * @intent decide what a close archives of a worktree's lot files before it moves
 */
export function keepDeclarations(params: {
	worktree: string
	folder: string
	owned: boolean
	/** The commits the lot files' packages may have been deleted by start from: their packages are found too. */
	bases?: readonly string[]
}): ClosingDeclarations {
	const { worktree, folder } = params
	const decided = lotFilesOf({ root: worktree, bases: params.bases }).map(
		function decideDeclaration(lotFile) {
			const { packagePath, file } = lotFile
			const bytes = readFileSync(file, 'utf8')
			const archived = archivedDeclarationPath({ folder, packagePath, name: ARCHIVED_LOT_FILE })
			const landed = archivedDeclarationPath({ folder, packagePath, name: LANDED_LOT_FILE })
			const decision = archiveDecision({
				bytes,
				archived: archiveOf({ folder, packagePath, name: ARCHIVED_LOT_FILE })?.bytes,
				landed: archiveOf({ folder, packagePath, name: LANDED_LOT_FILE })?.bytes,
				owned: params.owned,
			})
			return { packagePath, file, bytes, archived, landed, decision }
		},
	)
	return {
		counted: decided.flatMap(({ packagePath, bytes, decision }) =>
			decision.kind === 'untouched' || decision.kind === 'keep'
				? []
				: [{ packagePath, bytes: Buffer.from(bytes) }],
		),
		archives: decided.flatMap(({ bytes, archived, landed, decision }) =>
			decision.kind === 'write'
				? [{ path: decision.name === ARCHIVED_LOT_FILE ? archived : landed, bytes }]
				: [],
		),
		kept: decided.flatMap(({ file, archived, landed, decision }) =>
			decision.kind === 'keep'
				? [{ file: relative(worktree, file).split(sep).join('/'), archived, landed }]
				: [],
		),
	}
}

/**
 * The archives a close decided, each written never over one and read back (`writeArchive`); the first that fails
 * throws why, so the worktree stays.
 * @intent keep a closing worktree's lot files in its lot folder
 */
export function writeDeclarationArchives(params: {
	archives: readonly DeclarationArchive[]
}): void {
	for (const archive of params.archives) {
		const failure = writeArchive({ archive: archive.path, bytes: archive.bytes })
		if (failure) throw new Error(failure)
	}
}

/**
 * Writes `bytes` as the archive, never over one (the decision read none there), and reads it back; why it failed,
 * or undefined.
 */
function writeArchive(params: { archive: string; bytes: string }): string | undefined {
	const { archive, bytes } = params
	try {
		mkdirSync(dirname(archive), { recursive: true })
		writeFileSync(archive, bytes, { flag: 'wx' })
		if (readFileSync(archive, 'utf8') !== bytes)
			return ARCHIVE_READ_BACK_DIFFERS.replace('{archive}', () => archive)
		return undefined
	} catch (error) {
		return error instanceof Error ? error.message : String(error)
	}
}

/** The folder's pending record; none when absent or unreadable (nothing is then owned through it). */
function readPendingArchives(folder: string): PendingArchive[] {
	const path = join(folder, ARCHIVE_PENDING_FILE)
	if (!existsSync(path)) return []
	try {
		const entries: unknown = JSON.parse(readFileSync(path, 'utf8'))
		return Array.isArray(entries) ? entries.filter(isPendingArchive) : []
	} catch {
		return []
	}
}

/** The pending record written, or removed when nothing is pending. */
function writePendingArchives(params: { folder: string; pending: PendingArchive[] }): void {
	const path = join(params.folder, ARCHIVE_PENDING_FILE)
	if (params.pending.length === 0) rmSync(path, { force: true })
	else writeFileSync(path, `${JSON.stringify(params.pending, null, '\t')}\n`)
}

function isPendingArchive(entry: unknown): entry is PendingArchive {
	return (
		typeof entry === 'object' &&
		entry !== null &&
		typeof (entry as PendingArchive).packagePath === 'string' &&
		typeof (entry as PendingArchive).sha256 === 'string'
	)
}

function sha256Of(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** One archive of a package path, read; undefined when absent. */
function archiveOf(params: {
	folder: string
	packagePath: string
	name: ArchiveName
}): ArchivedDeclaration | undefined {
	const path = archivedDeclarationPath(params)
	if (!existsSync(path)) return undefined
	return {
		packagePath: params.packagePath,
		name: params.name,
		path,
		bytes: readFileSync(path, 'utf8'),
	}
}

function isArchiveName(name: string): name is ArchiveName {
	return ARCHIVE_NAMES.some((archiveName) => archiveName === name)
}
