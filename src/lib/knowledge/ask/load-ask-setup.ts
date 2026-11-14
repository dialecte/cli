import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { readApiIndexes } from '../../api/read-api-indexes.ts'
import { collectCatalogues } from '../../run/explain-code.ts'
import { loadInstalledPackages } from '../../run/load-run-environment.ts'
import { loadDialectes, readManifest } from '../../schema/load-dialectes.ts'
import { findInstalledPackage } from '../../skills/sync-skills.ts'
import { stableJson } from '../../stable-json.ts'
import { factCheckOf } from '../facts/command-check.ts'
import { factsFolder } from '../facts/data-folder.ts'
import { PACKAGE_MANIFEST } from '../facts/facts.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { SETUP_HASH_ALGORITHM, SETUP_HASH_ENCODING, SETUP_REFUSALS } from './ask.constants.ts'

import type { Catalogues } from '../../run/explain-code.types.ts'
import type { LoadedDialecte, LoadedDialectes } from '../../schema/schema.types.ts'
import type { CheckOutcome } from '../facts/facts.types.ts'
import type { AskSetup, LoadAskSetupParams, LoadedAskSetup } from './ask.types.ts'

/**
 * What the ladder reads apart from the documents, loaded once from the folder an ask runs in: the installed
 * dialectes and their versions, the folder's own package, the facts folder and the check of its facts, the
 * catalogues and their hash, the api indexes and theirs. The refusal of a folder with no `package.json` or an api
 * index that does not read (exit 2).
 */
export async function loadAskSetup(params: LoadAskSetupParams): Promise<LoadedAskSetup> {
	const { cwd, environment } = params
	if (!existsSync(join(cwd, PACKAGE_MANIFEST)))
		return { refused: fillMessage({ template: SETUP_REFUSALS.noPackage, values: { cwd } }) }
	const loaded = await loadDialectes({ cwd })
	const { dialectes } = loaded
	const ownName = readManifest(cwd)?.name
	const ownPackage = dialectes.find((dialecte) => dialecte.packageName === ownName)?.packageName
	let apiIndexes: AskSetup['apiIndexes']
	try {
		apiIndexes = readApiIndexes({ cwd }).map((index) => ({ index, hash: hashOf(index) }))
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		return {
			refused: fillMessage({ template: SETUP_REFUSALS.apiIndexes, values: { cwd, reason } }),
		}
	}
	const catalogues = await cataloguesOf({ cwd, packageName: params.packageName, dialectes })
	const baseCheck = params.facts
		? await factCheckOf({ environment, cwd, loadDialectes: loadedAlready({ loaded }) })
		: everyFactAsStored
	return {
		setup: {
			dialectes,
			versions: Object.fromEntries(
				dialectes.map((dialecte) => [
					dialecte.packageName,
					versionOf({ cwd, ownName, packageName: dialecte.packageName }),
				]),
			),
			...(ownPackage === undefined ? {} : { ownPackage }),
			// the environment's home (an empty one is unset), else the process's
			factsFolder: factsFolder({ environment, home: environment.HOME || undefined }),
			catalogues,
			catalogueHash: hashOf(catalogues),
			apiIndexes,
			baseCheck,
		},
	}
}

/**
 * The catalogues of core and of the dialecte the ask names (`--package`, else the only one installed, else the one
 * the folder depends on); none when core cannot be imported from the folder (the code rung then finds nothing).
 */
async function cataloguesOf(params: {
	cwd: string
	packageName: string | undefined
	dialectes: LoadedDialecte[]
}): Promise<Catalogues> {
	const [only, ...others] = params.dialectes
	const packageName = params.packageName ?? (others.length === 0 ? only?.packageName : undefined)
	try {
		const installed = await loadInstalledPackages({
			projectDirectory: params.cwd,
			packageName,
			dialecteRequired: false,
		})
		return collectCatalogues({ coreIndex: installed.coreIndex, dialecte: installed.dialecte })
	} catch {
		// no core to import from here: no catalogue to explain a code with
		return { errors: [], diagnostics: [] }
	}
}

/** The installed version of a dialecte: the folder's own manifest for its own package, else the installed one's. */
function versionOf(params: {
	cwd: string
	ownName: string | undefined
	packageName: string
}): string {
	const { cwd, packageName } = params
	const folder =
		params.ownName === packageName ? cwd : findInstalledPackage({ cwd, name: packageName })
	return (folder === undefined ? undefined : readManifest(folder)?.version) ?? ''
}

/** A loader of the dialectes that answers those already loaded (the check reads them once with the ask). */
function loadedAlready(params: { loaded: LoadedDialectes }): () => Promise<LoadedDialectes> {
	return async function loadedDialectes() {
		return params.loaded
	}
}

/** The check of a run that reads no fact: every fact as it stands (never called). */
function everyFactAsStored(): CheckOutcome {
	return { state: 'valid' }
}

/** The hash of a value's stable JSON (D10). */
function hashOf(value: unknown): string {
	return createHash(SETUP_HASH_ALGORITHM).update(stableJson(value)).digest(SETUP_HASH_ENCODING)
}
