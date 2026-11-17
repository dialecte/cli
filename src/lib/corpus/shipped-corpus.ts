/** The manifest and override files the cli ships: beside this module in the sources, under `corpus/` beside the bundle. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MANIFEST_FILE, OVERRIDES_FOLDER, SHIPPED_CORPUS_FOLDER } from './corpus.constants.ts'

import type { CorpusManifest, ShippedCorpus } from './corpus.types.ts'

export function readShippedCorpus(params: { moduleFolder?: string } = {}): ShippedCorpus {
	const here = params.moduleFolder ?? dirname(fileURLToPath(import.meta.url))
	const folder = existsSync(join(here, MANIFEST_FILE)) ? here : join(here, SHIPPED_CORPUS_FOLDER)
	// the shipped manifest: reviewed data of this package, read as its type
	const manifest = JSON.parse(readFileSync(join(folder, MANIFEST_FILE), 'utf8')) as CorpusManifest
	return { manifest, overrides: join(folder, OVERRIDES_FOLDER) }
}
