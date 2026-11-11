/**
 * The copy `lot export` makes of a lot folder (33L0 section 9.6): into `<dir>/.<full name>.tmp-<pid>/`, `asks/` left
 * out, links copied as links, modes kept, the lot's `cards.log` lines and its registry entry added; every file
 * compared with its source (`events.jsonl` as a prefix), copied once more on a difference; then renamed to
 * `<dir>/<full name>`. File reads and writes only: no git, no child process. The source is never written.
 */
import { createHash } from 'node:crypto'
import {
	chmodSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { copyFileOrLink } from '../copy-file-or-link.ts'
import { CARDS_LOG_FILE } from '../events/cards-log.constants.ts'
import { rawLinesOfLot } from '../events/cards-log.ts'
import { isAtOrInside, realPathOf, realPathThroughAncestors } from '../file-system.ts'
import { entryPathOf, registeredEntryOf } from '../handover/handover-store-read.ts'
import {
	COPY_ATTEMPTS,
	COPY_DIFFERS,
	EXPORT_TEMPORARY_NAME,
	EXPORT_TEMPORARY_PREFIX,
	PERMISSION_BITS,
} from './export-lot.constants.ts'
import { registryOfLotFolder } from './lot-records.ts'
import { LINE_FEED, STORE_FILES } from './store.constants.ts'

import type { LotExportJson } from '../../commands/lot-export.types.ts'
import type { CopiedEntry, ExportLotParams, ExportOutcome } from './export-lot.types.ts'

/** The temporary folder this run copies into, in `dir`. */
export function exportTemporaryOf(params: { dir: string; name: string }): string {
	return join(
		params.dir,
		EXPORT_TEMPORARY_NAME.replace('{name}', params.name).replace('{pid}', String(process.pid)),
	)
}

/**
 * Copies the lot into this run's temporary folder of `dir`, checks the copy and renames it to `<dir>/<full name>`:
 * the answer with the other runs' leftovers (named, never removed), or the file that differed twice (this run's
 * temporary folder removed). The caller checked `dir` and that neither the copy nor the temporary folder exists.
 */
export function exportLot(params: ExportLotParams): ExportOutcome {
	const { lotFolder, dir } = params
	const name = basename(lotFolder)
	const temporary = exportTemporaryOf({ dir, name })
	const prefix = EXPORT_TEMPORARY_PREFIX.replace('{name}', name)
	const leftovers = readdirSync(dir)
		.filter((entry) => entry.startsWith(prefix) && join(dir, entry) !== temporary)
		.map((entry) => join(dir, entry))
	const tree = lotTreeOf({ lotFolder })
	const added = addedEntriesOf({ lotFolder })
	// only a temporary folder this run made is ever removed: one that appeared meanwhile is another's
	let made = false
	try {
		mkdirSync(temporary)
		made = true
		for (const folder of tree.folders) mkdirSync(join(temporary, folder.path))
		for (const entry of [...tree.entries, ...added]) {
			const copied = copyChecked({
				entry,
				to: join(temporary, entry.path),
				afterFileCopied: params.afterFileCopied,
			})
			if (!copied) {
				rmSync(temporary, { recursive: true, force: true })
				return { failed: COPY_DIFFERS.replace('{path}', entry.path) }
			}
		}
		// the folders' own modes last, the deepest first: a read-only folder takes no file
		for (const folder of [...tree.folders].reverse())
			chmodSync(join(temporary, folder.path), folder.mode)
		chmodSync(temporary, lstatSync(lotFolder).mode & PERMISSION_BITS)
		const counts = countsOf({ folder: temporary, paths: [...tree.entries, ...added] })
		const exported = join(dir, name)
		renameSync(temporary, exported)
		const answer: LotExportJson = {
			exported,
			...counts,
			skipped: tree.skipped,
			links: tree.links,
		}
		return { exported: answer, leftovers }
	} catch (error) {
		if (made) rmSync(temporary, { recursive: true, force: true })
		return { failed: (error as Error).message }
	}
}

/**
 * The folders (with their modes, parents first), the files and links of the lot folder, `asks/` left out (named in
 * `skipped`), and the links whose resolved target lies outside the lot folder.
 */
function lotTreeOf(params: { lotFolder: string }): {
	folders: { path: string; mode: number }[]
	entries: CopiedEntry[]
	skipped: string[]
	links: LotExportJson['links']
} {
	const { lotFolder } = params
	const realLotFolder = realPathOf(lotFolder)
	const tree = {
		folders: [] as { path: string; mode: number }[],
		entries: [] as CopiedEntry[],
		skipped: [] as string[],
		links: [] as LotExportJson['links'],
	}
	const pending = ['']
	for (let folder = pending.shift(); folder !== undefined; folder = pending.shift()) {
		for (const entry of readdirSync(join(lotFolder, folder)).sort()) {
			const path = folder === '' ? entry : `${folder}/${entry}`
			const file = join(lotFolder, path)
			const stats = lstatSync(file)
			if (path === STORE_FILES.asks && stats.isDirectory()) {
				tree.skipped.push(`${STORE_FILES.asks}/`)
				continue
			}
			if (stats.isDirectory()) {
				tree.folders.push({ path, mode: stats.mode & PERMISSION_BITS })
				pending.push(path)
				continue
			}
			if (stats.isSymbolicLink()) {
				const target = readlinkSync(file)
				// judged on what the target resolves to (a link on its way out included); only read, never copied
				const resolved = realPathThroughAncestors(resolve(realPathOf(dirname(file)), target))
				if (!isAtOrInside({ path: resolved, folder: realLotFolder }))
					tree.links.push({ path, target })
			}
			tree.entries.push({ path, source: { file }, prefix: path === STORE_FILES.events })
		}
	}
	return tree
}

/** What the export adds: the lot's `cards.log` lines when the log holds any, its registry entry when it has one. */
function addedEntriesOf(params: { lotFolder: string }): CopiedEntry[] {
	const registry = registryOfLotFolder(params.lotFolder)
	const lines = rawLinesOfLot({
		file: join(registry, CARDS_LOG_FILE),
		lot: basename(params.lotFolder),
	})
	const entry = registeredEntryOf({ store: registry, folder: params.lotFolder })
	return [
		...(lines.length > 0
			? [
					{
						path: STORE_FILES.cardsLog,
						source: { text: `${lines.join(LINE_FEED)}${LINE_FEED}` },
						prefix: false,
					},
				]
			: []),
		...(entry === undefined
			? []
			: [
					{
						path: STORE_FILES.registry,
						source: { file: entryPathOf({ store: registry, name: entry.name }) },
						prefix: false,
					},
				]),
	]
}

/** Copies the entry and compares it with its source, once more on a difference; whether the copy matches. */
function copyChecked(params: {
	entry: CopiedEntry
	to: string
	afterFileCopied: ExportLotParams['afterFileCopied']
}): boolean {
	const { entry, to } = params
	for (let attempt = 1; attempt <= COPY_ATTEMPTS; attempt += 1) {
		if ('file' in entry.source) copyFileOrLink({ from: entry.source.file, to })
		else writeFileSync(to, entry.source.text)
		params.afterFileCopied?.({ path: entry.path, attempt })
		if (copyMatches({ entry, to })) return true
	}
	return false
}

/**
 * Whether the copy holds its source: a link's target, else the size and sha256 of the bytes (the copy's bytes a
 * prefix of the source's for `events.jsonl`).
 */
function copyMatches(params: { entry: CopiedEntry; to: string }): boolean {
	const { entry, to } = params
	if ('text' in entry.source)
		return sameBytes({ copy: readFileSync(to), source: Buffer.from(entry.source.text) })
	const source = entry.source.file
	if (lstatSync(to).isSymbolicLink())
		return lstatSync(source).isSymbolicLink() && readlinkSync(source) === readlinkSync(to)
	const copy = readFileSync(to)
	const bytes = readFileSync(source)
	return sameBytes({ copy, source: entry.prefix ? bytes.subarray(0, copy.length) : bytes })
}

/** Same size and same sha256. */
function sameBytes(params: { copy: Buffer; source: Buffer }): boolean {
	return (
		params.copy.length === params.source.length && sha256Of(params.copy) === sha256Of(params.source)
	)
}

/** The sha256 of bytes, hex. */
function sha256Of(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex')
}

/** The files and links of the copy, and the bytes of its regular files. */
function countsOf(params: { folder: string; paths: readonly CopiedEntry[] }): {
	files: number
	bytes: number
} {
	let bytes = 0
	for (const entry of params.paths) {
		const stats = lstatSync(join(params.folder, entry.path))
		if (stats.isFile()) bytes += stats.size
	}
	return { files: params.paths.length, bytes }
}

/** Whether a path exists as anything, a dangling link included. */
export function existsAsAnything(path: string): boolean {
	try {
		lstatSync(path)
		return true
	} catch {
		return false
	}
}
