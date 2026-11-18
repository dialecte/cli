/**
 * The one archive rule of a hand-over folder's lot files: where each package's declaration is archived, the
 * per-file decision, the move `handover run` makes, and the reader of what a folder holds.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { lotFilesOf } from '../worktree/lot-files.ts'
import { ARCHIVE_NAMES, PACKAGE_ARCHIVES_FOLDER } from './archived-declarations.constants.ts'
import { EMPTY_LOT_DECLARATION } from './handover.constants.ts'
import { isEmptyDeclaration } from './is-empty-declaration.ts'

import type {
	ArchiveDecision,
	ArchiveDecisionParams,
	ArchivedDeclaration,
	ArchiveName,
	MovedDeclaration,
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
	if (archived === undefined) return { kind: 'write', name: 'lot.json' }
	if (archived === bytes) return { kind: 'already', name: 'lot.json' }
	if (landed === undefined) return { kind: 'write', name: 'lot.landed.json' }
	if (landed === bytes) return { kind: 'already', name: 'lot.landed.json' }
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
 * Every lot file of the worktree through `archiveDecision`, archived into `folder`, then emptied when archived
 * or already archived; the others left as they are.
 * @intent archive a committed hand-over's lot files
 */
export function moveDeclarations(params: {
	worktree: string
	folder: string
	owned: boolean
}): MovedDeclaration[] {
	const { folder, owned } = params
	return lotFilesOf({ root: params.worktree }).map(function moveDeclaration(lotFile) {
		const { packagePath, file } = lotFile
		const bytes = readFileSync(file, 'utf8')
		const decision = archiveDecision({
			bytes,
			archived: archiveOf({ folder, packagePath, name: 'lot.json' })?.bytes,
			landed: archiveOf({ folder, packagePath, name: 'lot.landed.json' })?.bytes,
			owned,
		})
		const stored = decision.kind === 'write' || decision.kind === 'already'
		const archive = archivedDeclarationPath({
			folder,
			packagePath,
			name: stored ? decision.name : 'lot.json',
		})
		if (decision.kind === 'write') {
			mkdirSync(dirname(archive), { recursive: true })
			// never over an archive: the decision read none there
			writeFileSync(archive, bytes, { flag: 'wx' })
		}
		if (stored) writeFileSync(file, EMPTY_LOT_DECLARATION)
		return { packagePath, file, decision, archive, empty: isEmptyDeclaration(bytes) }
	})
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
