/**
 * `dialecte corpus list`: every open source of the manifest with its cache state, then every licensed entry of
 * config.yml. The one reader the validation tier calls (`--json`); it reads only, and missing entries are listed, not
 * refused.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { manifestEntryHashOf, readCorpusLock } from './corpus-lock.ts'
import { LICENSED_INSTANCE_GLOB, LICENSED_VERDICT } from './corpus.constants.ts'
import { fnmatchesAny } from './fnmatch.ts'

import type {
	CorpusListEntry,
	CorpusLock,
	CorpusManifest,
	CorpusState,
	LicensedCorpora,
	ManifestSource,
} from './corpus.types.ts'

export function listCorpora(params: {
	manifest: CorpusManifest
	cache: string
	licensed: LicensedCorpora
}): CorpusListEntry[] {
	const lock = readCorpusLock({ cache: params.cache }).entries
	return [
		...params.manifest.sources.map((source) => openEntryOf({ source, cache: params.cache, lock })),
		...Object.entries(params.licensed).map(([name, entry]) => licensedEntryOf({ name, ...entry })),
	]
}

/**
 * `missing` without its folder; `fetched` when the lock holds it from this manifest entry; `stale` when from another,
 * or when the lock has no entry it can read for a folder that is there.
 */
export function openStateOf(params: {
	source: ManifestSource
	cache: string
	lock: CorpusLock
}): CorpusState {
	if (!existsSync(join(params.cache, params.source.id))) return 'missing'
	const locked = params.lock[params.source.id]
	return locked?.manifest === manifestEntryHashOf(params.source) ? 'fetched' : 'stale'
}

function openEntryOf(params: {
	source: ManifestSource
	cache: string
	lock: CorpusLock
}): CorpusListEntry {
	const { source } = params
	const folder = join(params.cache, source.id)
	const state = openStateOf(params)
	const files = state === 'missing' ? [] : Object.keys(params.lock[source.id]?.sha256 ?? {}).sort()
	const instances = source.instances ?? []
	return {
		name: source.id,
		source: 'open',
		verdict: source.verdict ?? LICENSED_VERDICT,
		license: source.license,
		suite: source.suite,
		state,
		folder,
		entries: files
			.filter((path) => fnmatchesAny({ path, patterns: source.entries ?? [] }))
			.map((path) => join(folder, ...path.split('/'))),
		instances: { folder, globs: instances },
		instanceCount: files.filter((path) => fnmatchesAny({ path, patterns: instances })).length,
	}
}

function licensedEntryOf(params: {
	name: string
	xsd: string
	instances?: string
}): CorpusListEntry {
	const { instances } = params
	const instancesThere = instances === undefined || existsSync(instances)
	return {
		name: params.name,
		source: 'licensed',
		verdict: LICENSED_VERDICT,
		state: existsSync(params.xsd) && instancesThere ? 'present' : 'missing',
		entries: [params.xsd],
		instances:
			instances === undefined ? undefined : { folder: instances, globs: [LICENSED_INSTANCE_GLOB] },
		instanceCount: instances !== undefined && existsSync(instances) ? fileCountOf(instances) : 0,
	}
}

function fileCountOf(folder: string): number {
	return readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) =>
		entry.isFile(),
	).length
}
