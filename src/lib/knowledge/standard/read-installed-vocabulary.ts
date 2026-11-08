import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { loadDialectes, readManifest } from '../../schema/load-dialectes.ts'
import { findInstalledPackage } from '../../skills/sync-skills.ts'
import {
	INSTALLED_HASH_LENGTH,
	INSTALLED_LIST_SEPARATOR,
	PACKAGE_MANIFEST,
} from './standard-cache.constants.ts'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type {
	StandardInstalledVocabulary,
	StandardInstalledVocabularyAnswer,
} from './standard-cache.types.ts'

/**
 * The tags, attributes and enumeration values of the dialectes installed where the command runs (as `schema`
 * reads them) - of the one named `packageName` only, when given - with their sorted `name@version` list and
 * its hash, which names the tags file. A folder without a `package.json`, or with no dialecte installed, has
 * an empty vocabulary and no hash: never a throw. A `packageName` no installed dialecte has is refused with
 * the names of the installed ones.
 */
export async function readInstalledVocabulary(params: {
	cwd: string
	packageName?: string
}): Promise<StandardInstalledVocabularyAnswer> {
	const { cwd, packageName } = params
	const installed = existsSync(join(cwd, PACKAGE_MANIFEST))
		? (await loadDialectes({ cwd })).dialectes
		: []
	const selected =
		packageName === undefined
			? installed
			: installed.filter((dialecte) => dialecte.packageName === packageName)
	if (packageName !== undefined && selected.length === 0)
		return {
			kind: 'unknownPackage',
			name: packageName,
			installed: installed.map((dialecte) => dialecte.packageName).sort(),
		}
	return { kind: 'read', installed: vocabularyOf({ cwd, dialectes: selected }) }
}

function vocabularyOf(params: {
	cwd: string
	dialectes: LoadedDialecte[]
}): StandardInstalledVocabulary {
	const { cwd, dialectes } = params
	if (dialectes.length === 0) return emptyInstalledVocabulary()
	const tags = new Set<string>()
	const attributes = new Set<string>()
	const values = new Set<string>()
	for (const { config, readers } of dialectes) {
		for (const tag of config.elements) tags.add(tag)
		for (const definition of Object.values(config.definition))
			for (const attribute of definition.attributes.sequence) {
				attributes.add(attribute)
				const datatype = definition.attributes.details[attribute]?.type
				for (const value of readers.enumeratedValues(datatype)) values.add(value)
			}
	}
	const packages = dialectes
		.map((dialecte) => `${dialecte.packageName}@${versionOf({ cwd, dialecte })}`)
		.sort()
	return {
		vocabulary: {
			tags: [...tags].sort(),
			attributes: [...attributes].sort(),
			values: [...values].sort(),
		},
		packages,
		installedHash: createHash('sha256')
			.update(packages.join(INSTALLED_LIST_SEPARATOR))
			.digest('hex')
			.slice(0, INSTALLED_HASH_LENGTH),
	}
}

/** The version of an installed dialecte: the package where the command runs, or the one it resolves. */
function versionOf(params: { cwd: string; dialecte: LoadedDialecte }): string {
	const own = readManifest(params.cwd)
	const folder =
		own?.name === params.dialecte.packageName
			? params.cwd
			: findInstalledPackage({ cwd: params.cwd, name: params.dialecte.packageName })
	return (folder === undefined ? undefined : readManifest(folder)?.version) ?? ''
}

/** No tag, no attribute, no value, no package, no tags file: what a folder with no installed dialecte has. */
export function emptyInstalledVocabulary(): StandardInstalledVocabulary {
	return {
		vocabulary: { tags: [], attributes: [], values: [] },
		packages: [],
		installedHash: undefined,
	}
}
