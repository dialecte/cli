/**
 * `dialecte corpus fetch`: each source checked (licence fields, pins), its downloads checked against their pins (kept
 * ones first), its tree built in memory, then written to a staging folder beside its own and swapped in. A refused
 * source changes nothing of its folder, its lock entry or its kept downloads. The lock names a tree only once it is in
 * place: the entry is dropped before the swap and written after it, so a run stopped in between leaves a folder the
 * lock does not vouch for (stale). One fetch writes a cache at a time (`fetch.lock`).
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { manifestEntryHashOf, readCorpusLock, sha256Of, writeCorpusLock } from './corpus-lock.ts'
import {
	DOWNLOAD_TIMEOUT_MILLISECONDS,
	DOWNLOADS_FOLDER,
	FETCH_LOCK_HELD,
	LOCK_FILE,
	MAX_DOWNLOAD_BYTES,
	MAX_EXTRACTED_BYTES,
	PREVIOUS_SUFFIX,
	STAGING_SUFFIX,
	UNBUILT_SOURCE,
} from './corpus.constants.ts'
import { acquireFetchLock, fetchLockFileOf, releaseFetchLock } from './fetch-lock.ts'
import { keptDownloadOf, keptFileOf } from './kept-download.ts'
import { pinnedDownloadsOf, sourceProblemOf } from './source-pins.ts'
import { sourceTreeOf } from './source-tree.ts'

import type {
	CorpusFile,
	CorpusManifest,
	FetchedSource,
	ManifestSource,
	SourceOutcome,
	SourceTree,
	CorpusLimits,
} from './corpus.types.ts'

export async function fetchCorpora(params: {
	manifest: CorpusManifest
	overrides: string
	cache: string
	/** The sources to fetch; every source when empty (the kept downloads no source names are then removed). */
	ids: readonly string[]
	/** How long a download may go without receiving anything (default DOWNLOAD_TIMEOUT_MILLISECONDS). */
	timeoutMilliseconds?: number
	/** The most bytes one download, and one archive once decompressed, may hold (defaults: the constants). */
	limits?: CorpusLimits
}): Promise<SourceOutcome[]> {
	const { cache } = params
	mkdirSync(cache, { recursive: true })
	const selected =
		params.ids.length === 0
			? params.manifest.sources
			: params.manifest.sources.filter((source) => params.ids.includes(source.id))
	const lock = acquireFetchLock({ cache })
	if (lock.kind === 'held') return heldBy({ selected, cache, pid: lock.pid })
	try {
		const outcomes: SourceOutcome[] = []
		const options = {
			cache,
			overrides: params.overrides,
			timeoutMilliseconds: params.timeoutMilliseconds ?? DOWNLOAD_TIMEOUT_MILLISECONDS,
			limits: params.limits ?? {
				downloadBytes: MAX_DOWNLOAD_BYTES,
				extractedBytes: MAX_EXTRACTED_BYTES,
			},
		}
		for (const source of selected) {
			const fetched = await fetchSource({ source, ...options })
			outcomes.push(fetched.outcome)
			if (fetched.kind === 'fetched')
				writeCorpusLock({
					cache,
					lock: { ...readCorpusLock({ cache }).raw, [source.id]: fetched.lock },
				})
		}
		if (!existsSync(join(cache, LOCK_FILE)))
			writeCorpusLock({ cache, lock: readCorpusLock({ cache }).raw })
		if (params.ids.length === 0) pruneDownloads({ cache, manifest: params.manifest })
		return outcomes
	} finally {
		releaseFetchLock({ cache })
	}
}

/** Every selected source refused: another running fetch holds the cache. */
function heldBy(params: {
	selected: readonly ManifestSource[]
	cache: string
	pid: number
}): SourceOutcome[] {
	return params.selected.map((source) => ({
		id: source.id,
		kind: 'refused',
		reason: fillMessage({
			template: FETCH_LOCK_HELD,
			values: {
				id: source.id,
				lock: fetchLockFileOf({ cache: params.cache }),
				pid: String(params.pid),
			},
		}),
	}))
}

async function fetchSource(params: {
	source: ManifestSource
	cache: string
	overrides: string
	timeoutMilliseconds: number
	limits: CorpusLimits
}): Promise<FetchedSource> {
	const { source, cache } = params
	const problem = sourceProblemOf(source)
	if (problem !== undefined) return refusedSource({ id: source.id, reason: problem })
	const downloads = new Map<string, Uint8Array>()
	for (const download of pinnedDownloadsOf(source)) {
		const kept = await keptDownloadOf({
			id: source.id,
			cache,
			url: download.url,
			sha256: download.sha256 ?? '',
			timeoutMilliseconds: params.timeoutMilliseconds,
			maxBytes: params.limits.downloadBytes,
		})
		if (kept.kind === 'refused') return refusedSource({ id: source.id, reason: kept.reason })
		downloads.set(download.url, kept.bytes)
	}
	const tree = writtenTreeOf({
		source,
		downloads,
		cache,
		overrides: params.overrides,
		maxExtractedBytes: params.limits.extractedBytes,
	})
	if (tree.kind === 'refused') return refusedSource({ id: source.id, reason: tree.reason })
	const bytes = tree.files.reduce((total, file) => total + file.bytes.byteLength, 0)
	return {
		kind: 'fetched',
		outcome: { id: source.id, kind: 'fetched', files: tree.files.length, bytes },
		lock: {
			files: tree.files.length,
			bytes,
			// a source with a problem never reaches here: its verdict is set
			verdict: source.verdict ?? 'schemas-only',
			manifest: manifestEntryHashOf(source),
			sha256: Object.fromEntries(tree.files.map((file) => [file.path, sha256Of(file.bytes)])),
		},
	}
}

function refusedSource(params: { id: string; reason: string }): FetchedSource {
	return { kind: 'refused', outcome: { id: params.id, kind: 'refused', reason: params.reason } }
}

/**
 * The source's tree built and written; refused with its reason when the build refuses it or fails on bytes it cannot
 * read (a broken archive, a glob that does not compile, a path that is both a file and a folder): one source never
 * stops the others.
 */
function writtenTreeOf(params: {
	source: ManifestSource
	downloads: ReadonlyMap<string, Uint8Array>
	cache: string
	overrides: string
	maxExtractedBytes: number
}): SourceTree {
	const folder = join(params.cache, params.source.id)
	try {
		const tree = sourceTreeOf(params)
		if (tree.kind === 'tree') {
			dropLockEntry({ cache: params.cache, id: params.source.id })
			writeTree({ folder, files: tree.files })
		}
		return tree
	} catch (error) {
		rmSync(stagingOf(folder), { recursive: true, force: true })
		const reason = error instanceof Error ? error.message : String(error)
		return {
			kind: 'refused',
			reason: fillMessage({ template: UNBUILT_SOURCE, values: { id: params.source.id, reason } }),
		}
	}
}

function stagingOf(folder: string): string {
	return join(dirname(folder), `${basename(folder)}${STAGING_SUFFIX}`)
}

/** The tree written to `<folder>.staging`, then swapped in place of `folder`. */
function writeTree(params: { folder: string; files: readonly CorpusFile[] }): void {
	const staging = stagingOf(params.folder)
	rmSync(staging, { recursive: true, force: true })
	mkdirSync(staging, { recursive: true })
	for (const file of params.files) {
		const target = join(staging, ...file.path.split('/'))
		mkdirSync(dirname(target), { recursive: true })
		writeFileSync(target, file.bytes)
	}
	// the old tree moves aside in one rename, the new one comes in, and only then is the old one removed
	const previous = `${params.folder}${PREVIOUS_SUFFIX}`
	rmSync(previous, { recursive: true, force: true })
	if (existsSync(params.folder)) renameSync(params.folder, previous)
	renameSync(staging, params.folder)
	rmSync(previous, { recursive: true, force: true })
}

/** The lock without the source's entry: from here until its new entry, the lock vouches for no tree of it. */
function dropLockEntry(params: { cache: string; id: string }): void {
	const raw = readCorpusLock({ cache: params.cache }).raw
	if (!Object.hasOwn(raw, params.id)) return
	writeCorpusLock({
		cache: params.cache,
		lock: Object.fromEntries(Object.entries(raw).filter(([id]) => id !== params.id)),
	})
}

/** Removes the kept downloads no source of the manifest names any more. */
function pruneDownloads(params: { cache: string; manifest: CorpusManifest }): void {
	const folder = join(params.cache, DOWNLOADS_FOLDER)
	if (!existsSync(folder)) return
	const wanted = new Set(
		params.manifest.sources.flatMap((source) =>
			pinnedDownloadsOf(source).map((download) =>
				basename(keptFileOf({ cache: params.cache, url: download.url })),
			),
		),
	)
	for (const name of readdirSync(folder))
		if (!wanted.has(name)) rmSync(join(folder, name), { force: true })
}
