/**
 * `dialecte corpus check`: each fetched source against its lock (built from this manifest entry, every file there with
 * its sha256, no file added), each licensed entry against its files. An open source never fetched is no problem.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readCorpusLock, sha256Of } from './corpus-lock.ts'
import { CORPUS_MESSAGES } from './corpus.constants.ts'
import { openStateOf } from './list-corpora.ts'

import type { CorpusManifest, CorpusProblem, LicensedCorpora } from './corpus.types.ts'

export function checkCorpora(params: {
	manifest: CorpusManifest
	cache: string
	licensed: LicensedCorpora
}): CorpusProblem[] {
	const lock = readCorpusLock({ cache: params.cache }).entries
	const problems: CorpusProblem[] = []
	for (const source of params.manifest.sources) {
		const state = openStateOf({ source, cache: params.cache, lock })
		if (state === 'missing') continue
		if (state === 'stale')
			problems.push(problemOf({ id: source.id, template: CORPUS_MESSAGES.staleSource }))
		const locked = lock[source.id]
		if (locked === undefined) continue
		const folder = join(params.cache, source.id)
		for (const [path, sha256] of Object.entries(locked.sha256)) {
			const file = join(folder, ...path.split('/'))
			if (!existsSync(file))
				problems.push(problemOf({ id: source.id, template: CORPUS_MESSAGES.missingFile, path }))
			else if (sha256Of(readFileSync(file)) !== sha256)
				problems.push(problemOf({ id: source.id, template: CORPUS_MESSAGES.editedFile, path }))
		}
		for (const path of filesUnder(folder))
			if (!Object.hasOwn(locked.sha256, path))
				problems.push(problemOf({ id: source.id, template: CORPUS_MESSAGES.extraFile, path }))
	}
	for (const [name, entry] of Object.entries(params.licensed))
		for (const path of [entry.xsd, ...(entry.instances === undefined ? [] : [entry.instances])])
			if (!existsSync(path))
				problems.push({
					name,
					problem: fillMessage({
						template: CORPUS_MESSAGES.licensedMissing,
						values: { id: name, path },
					}),
				})
	return problems
}

/** The problem `template` names for source `id`. */
function problemOf(params: { id: string; template: string; path?: string }): CorpusProblem {
	return {
		name: params.id,
		problem: fillMessage({
			template: params.template,
			values: { id: params.id, path: params.path ?? '' },
		}),
	}
}

/** Every entry under `folder` but its folders (files and links), relative, `/`-separated, sorted. */
function filesUnder(folder: string): string[] {
	return readdirSync(folder, { recursive: true, withFileTypes: true })
		.filter((entry) => !entry.isDirectory())
		.map((entry) => relative(folder, join(entry.parentPath, entry.name)).split('\\').join('/'))
		.sort()
}
