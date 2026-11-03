/**
 * The dialectes installed where the command runs, read as the app runs them: each package built on
 * `@dialecte/core` (the package itself and its dependencies) is imported in Node, its config found by shape
 * (an export holding `rootElementName` and `definition`), and core's readers imported from the core that
 * package resolves - two dialectes on two cores each answer with their own. Test entries are never imported.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { dependencyNames, findInstalledPackage } from '../skills/sync-skills.ts'
import { CORE_PACKAGE, CORE_READER_NAMES, CORE_READERS_ENTRY } from './schema.constants.ts'

import type {
	CoreReaders,
	ExportTarget,
	LoadedDialecte,
	LoadedDialectes,
	PackageManifest,
} from './schema.types.ts'
import type { AnyDialecteConfig } from '@dialecte/core'

export async function loadDialectes(params: { cwd: string }): Promise<LoadedDialectes> {
	const folders = [
		params.cwd,
		...dependencyNames(params.cwd).flatMap(
			(name) => findInstalledPackage({ cwd: params.cwd, name }) ?? [],
		),
	]
	const result: LoadedDialectes = { dialectes: [], skipped: [] }
	for (const folder of folders) {
		const manifest = readManifest(folder)
		if (!manifest?.name || !isBuiltOnCore(manifest)) continue
		try {
			const loaded = await loadDialecte({ folder, manifest, packageName: manifest.name })
			if (loaded) result.dialectes.push(loaded)
		} catch (error) {
			result.skipped.push({
				packageName: manifest.name,
				reason: error instanceof Error ? error.message : String(error),
			})
		}
	}
	result.dialectes.sort((left, right) => TEXT_COLLATOR.compare(left.packageName, right.packageName))
	return result
}

async function loadDialecte(params: {
	folder: string
	manifest: PackageManifest
	packageName: string
}): Promise<LoadedDialecte | undefined> {
	let config: AnyDialecteConfig | undefined
	for (const file of entryFiles(params)) {
		const exported: Record<string, unknown> = await import(pathToFileURL(file).href)
		config = Object.values(exported).find(isDialecteConfig)
		if (config) break
	}
	if (!config) return undefined
	const readersFile = createRequire(join(params.folder, 'package.json')).resolve(CORE_READERS_ENTRY)
	const readers: Record<string, unknown> = await import(pathToFileURL(readersFile).href)
	if (!isCoreReaders(readers))
		throw new Error(
			`its core (${readersFile}) lacks ${CORE_READER_NAMES.filter((name) => typeof readers[name] !== 'function').join(', ')}: update @dialecte/core`,
		)
	return { packageName: params.packageName, config, readers }
}

/** A folder's package.json, undefined when it has none. */
export function readManifest(folder: string): PackageManifest | undefined {
	const path = join(folder, 'package.json')
	return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
}

/** A dialecte: a package other than core that depends on core (or takes it as a peer). */
export function isBuiltOnCore(manifest: PackageManifest): boolean {
	return (
		manifest.name !== CORE_PACKAGE &&
		(manifest.dependencies?.[CORE_PACKAGE] !== undefined ||
			manifest.peerDependencies?.[CORE_PACKAGE] !== undefined)
	)
}

/**
 * The files the package exports, test entries left out, in the order its manifest lists them; a file the
 * manifest names that is not there throws (an unbuilt package is reported, not passed over).
 */
function entryFiles(params: { folder: string; manifest: PackageManifest }): string[] {
	const { exports, main } = params.manifest
	const targets: [string, ExportTarget][] =
		exports === undefined
			? main
				? [['.', main]]
				: []
			: typeof exports === 'string'
				? [['.', exports]]
				: Object.entries(exports)
	return targets
		.filter(([subpath]) => !subpath.split('/').includes('test') && !subpath.includes('*'))
		.flatMap(([, target]) => {
			const file = fileOf(target)
			return file && file.endsWith('js') ? [join(params.folder, file)] : []
		})
		.map(function existingFile(file: string): string {
			if (!existsSync(file))
				throw new Error(`entry file not found: ${file} (is the package built?)`)
			return file
		})
}

function fileOf(target: ExportTarget): string | undefined {
	if (typeof target === 'string') return target
	const file = target.import ?? target.node ?? target.default
	return typeof file === 'string' ? file : undefined
}

export function isDialecteConfig(value: unknown): value is AnyDialecteConfig {
	return (
		typeof value === 'object' &&
		value !== null &&
		'rootElementName' in value &&
		typeof value.rootElementName === 'string' &&
		'definition' in value &&
		typeof value.definition === 'object'
	)
}

export function isCoreReaders(
	module: Record<string, unknown>,
): module is Record<string, unknown> & CoreReaders {
	return CORE_READER_NAMES.every((name) => typeof module[name] === 'function')
}
