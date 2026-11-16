/**
 * `dialecte corpus fetch`: each source checked (licence fields, pins), its downloads checked against their pins (kept
 * ones first), its tree built in memory, then written to a staging folder beside its own and swapped in. A refused
 * source changes nothing of its folder, its lock entry or its kept downloads. The lock is written once, at the end.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { manifestEntryHashOf, readCorpusLock, sha256Of, writeCorpusLock } from './corpus-lock.ts'
import { DOWNLOADS_FOLDER, STAGING_SUFFIX } from './corpus.constants.ts'
import { keptDownloadOf, keptFileOf } from './kept-download.ts'
import { pinnedDownloadsOf, sourceProblemOf } from './source-pins.ts'
import { sourceTreeOf } from './source-tree.ts'

import type {
	CorpusFile,
	CorpusLock,
	CorpusManifest,
	FetchedSource,
	ManifestSource,
	SourceOutcome,
} from './corpus.types.ts'

export async function fetchCorpora(params: {
	manifest: CorpusManifest
	overrides: string
	cache: string
	/** The sources to fetch; every source when empty (the kept downloads no source names are then removed). */
	ids: readonly string[]
}): Promise<SourceOutcome[]> {
	const { cache } = params
	mkdirSync(cache, { recursive: true })
	const selected =
		params.ids.length === 0
			? params.manifest.sources
			: params.manifest.sources.filter((source) => params.ids.includes(source.id))
	const outcomes: SourceOutcome[] = []
	const lock: CorpusLock = { ...readCorpusLock({ cache }) }
	for (const source of selected) {
		const fetched = await fetchSource({ source, cache, overrides: params.overrides })
		outcomes.push(fetched.outcome)
		if (fetched.kind === 'fetched') lock[source.id] = fetched.lock
	}
	writeCorpusLock({ cache, lock })
	if (params.ids.length === 0) pruneDownloads({ cache, manifest: params.manifest })
	return outcomes
}

async function fetchSource(params: {
	source: ManifestSource
	cache: string
	overrides: string
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
		})
		if (kept.kind === 'refused') return refusedSource({ id: source.id, reason: kept.reason })
		downloads.set(download.url, kept.bytes)
	}
	const tree = sourceTreeOf({ source, downloads, overrides: params.overrides })
	if (tree.kind === 'refused') return refusedSource({ id: source.id, reason: tree.reason })
	writeTree({ folder: join(cache, source.id), files: tree.files })
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

/** The tree written to `<folder>.staging`, then swapped in place of `folder`. */
function writeTree(params: { folder: string; files: readonly CorpusFile[] }): void {
	const staging = join(dirname(params.folder), `${basename(params.folder)}${STAGING_SUFFIX}`)
	rmSync(staging, { recursive: true, force: true })
	mkdirSync(staging, { recursive: true })
	for (const file of params.files) {
		const target = join(staging, ...file.path.split('/'))
		mkdirSync(dirname(target), { recursive: true })
		writeFileSync(target, file.bytes)
	}
	rmSync(params.folder, { recursive: true, force: true })
	renameSync(staging, params.folder)
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
