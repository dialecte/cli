import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { NON_DIALECTE_PACKAGES } from './run.constants.ts'

import type {
	CoreModules,
	InstalledPackages,
	ModuleNamespace,
	RunEnvironment,
	RunProject,
} from './run.types.ts'

/**
 * The installed packages a run needs, loaded from the project the cli runs in: the dialecte (found by
 * shape among its exports - a declaration, a project factory, or a `create<Name>Project`), and the
 * core that dialecte resolves, so the script gets the same core instance its records come from.
 */
export async function loadRunEnvironment(params: {
	projectDirectory: string
	packageName?: string
}): Promise<RunEnvironment> {
	const installed = await loadInstalledPackages({ ...params, dialecteRequired: true })
	const { coreIndex, helpers, utils } = installed
	const dialecte = installed.dialecte ?? {}
	const core = readCoreModules({ coreIndex, helpers, utils })
	const createProject = findProjectMaker({
		dialecte,
		coreIndex,
		packageName: installed.packageName ?? '',
	})
	return { createProject, dialecte, core }
}

/**
 * The dialecte module (the one `packageName` names, or the one dialecte the project depends on) and
 * the core entries, resolved from the dialecte's own location first, then from the project. Without
 * `dialecteRequired`, a project with no dialecte answers the core alone.
 */
export async function loadInstalledPackages(params: {
	projectDirectory: string
	packageName?: string
	dialecteRequired: boolean
}): Promise<InstalledPackages> {
	const { projectDirectory, dialecteRequired } = params
	const resolveFromProject = createRequire(join(projectDirectory, 'package.json'))
	let packageName = params.packageName
	if (!packageName) {
		try {
			packageName = findDialecteEntry({ projectDirectory, resolveFromProject })
		} catch (thrown) {
			if (dialecteRequired) throw thrown
		}
	}

	const dialecteFile = packageName ? resolveFromProject.resolve(packageName) : undefined
	const dialecte = dialecteFile ? await importFile(dialecteFile) : undefined
	const resolvers = dialecteFile
		? [createRequire(dialecteFile), resolveFromProject]
		: [resolveFromProject]

	const coreIndex = await importFile(resolveFirst({ resolvers, specifier: '@dialecte/core' }))
	const helpers = await importFile(resolveFirst({ resolvers, specifier: '@dialecte/core/helpers' }))
	const utils = await importFile(resolveFirst({ resolvers, specifier: '@dialecte/core/utils' }))
	return { packageName, dialecte, coreIndex, helpers, utils }
}

function resolveFirst(params: { resolvers: NodeJS.Require[]; specifier: string }): string {
	const { resolvers, specifier } = params
	for (const resolver of resolvers) {
		try {
			return resolver.resolve(specifier)
		} catch {
			// the next place may hold it
		}
	}
	throw new Error(`run: ${specifier} is not installed - install @dialecte/core 0.8.0 or later`)
}

async function importFile(file: string): Promise<ModuleNamespace> {
	const loaded: unknown = await import(pathToFileURL(file).href)
	return loaded as ModuleNamespace
}

/**
 * The one dialecte the project depends on: an `@dialecte/*` package that is not core, the cli or the
 * generator, entered by its one non-test export path.
 */
export function findDialecteEntry(params: {
	projectDirectory: string
	resolveFromProject: NodeJS.Require
}): string {
	const { projectDirectory, resolveFromProject } = params
	const manifest = JSON.parse(readFileSync(join(projectDirectory, 'package.json'), 'utf8')) as {
		dependencies?: Record<string, string>
		devDependencies?: Record<string, string>
	}
	const candidates = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
		.filter((name) => name.startsWith('@dialecte/') && !NON_DIALECTE_PACKAGES.has(name))
		.sort()
	if (candidates.length !== 1)
		throw new Error(
			candidates.length === 0
				? 'run: no dialecte package in package.json - name one with --package <name>'
				: `run: several dialectes installed (${candidates.join(', ')}) - name one with --package <name>`,
		)

	const [packageName] = candidates
	const packageManifest = JSON.parse(
		readFileSync(findPackageManifest({ packageName, resolveFromProject }), 'utf8'),
	) as { exports?: Record<string, unknown> }
	const entries = Object.keys(packageManifest.exports ?? { '.': true }).filter(
		(entry) => entry !== './package.json' && !entry.endsWith('/test'),
	)
	if (entries.length !== 1)
		throw new Error(
			`run: ${packageName} has several entries (${entries.join(', ')}) - name one with --package ${packageName}/<entry>`,
		)
	return entries[0] === '.' ? packageName : `${packageName}/${entries[0].replace(/^\.\//, '')}`
}

/** A package's own package.json, found in the node_modules folders Node would search: its exports may not list it. */
function findPackageManifest(params: {
	packageName: string
	resolveFromProject: NodeJS.Require
}): string {
	const { packageName, resolveFromProject } = params
	const folders = resolveFromProject.resolve.paths(packageName) ?? []
	const manifest = folders
		.map((folder) => join(folder, packageName, 'package.json'))
		.find((candidate) => existsSync(candidate))
	if (!manifest) throw new Error(`run: ${packageName} is in package.json but not installed`)
	return manifest
}

function readCoreModules(params: {
	coreIndex: ModuleNamespace
	helpers: ModuleNamespace
	utils: ModuleNamespace
}): CoreModules {
	const { coreIndex, helpers, utils } = params
	const required = [
		{ entry: '@dialecte/core', name: 'toDialecteError', namespace: coreIndex },
		{ entry: '@dialecte/core/helpers', name: 'evaluateExpectations', namespace: helpers },
		{ entry: '@dialecte/core/utils', name: 'createSeededRandomUuid', namespace: utils },
	]
	const missing = required
		.filter(({ name, namespace }) => typeof namespace[name] !== 'function')
		.map(({ entry, name }) => `${name} (${entry})`)
	if (missing.length)
		throw new Error(
			`run: the installed core has no ${missing.join(', ')} - dialecte run needs @dialecte/core 0.8.0 or later`,
		)
	return {
		toDialecteError: coreIndex.toDialecteError as CoreModules['toDialecteError'],
		evaluateExpectations: helpers.evaluateExpectations as CoreModules['evaluateExpectations'],
		createSeededRandomUuid: utils.createSeededRandomUuid as CoreModules['createSeededRandomUuid'],
		helpers,
		utils,
	}
}

/** A fresh in-memory, writable project of the dialecte, made by whichever form the package exports. */
function findProjectMaker(params: {
	dialecte: ModuleNamespace
	coreIndex: ModuleNamespace
	packageName: string
}): () => RunProject {
	const { dialecte, coreIndex, packageName } = params
	const storage = { type: 'inMemory', writable: true }
	const exports = Object.entries(dialecte).sort(([left], [right]) => left.localeCompare(right))

	const factories = exports.filter(([, value]) => isProjectFactory(value))
	const declarations = exports.filter(([, value]) => isDeclaration(value))
	const legacyMakers = exports.filter(
		([name, value]) => typeof value === 'function' && /^create\w+Project$/.test(name),
	)

	const [chosen] = [factories, declarations, legacyMakers].filter((found) => found.length > 0)
	if (!chosen)
		throw new Error(
			`run: ${packageName} exports no dialecte declaration, project factory or create<Name>Project`,
		)
	if (chosen.length > 1)
		throw new Error(
			`run: ${packageName} exports several dialectes (${chosen.map(([name]) => name).join(', ')})`,
		)

	const [, value] = chosen[0]
	if (chosen === declarations) {
		const createProjectFactory = coreIndex.createProjectFactory as (params: {
			dialecte: unknown
			engineUrl: string
		}) => (params: { storage: unknown }) => RunProject
		const factory = createProjectFactory({ dialecte: value, engineUrl: '' })
		return function createDeclaredProject(): RunProject {
			return factory({ storage })
		}
	}
	const maker = value as (params: { storage: unknown }) => RunProject
	return function createExportedProject(): RunProject {
		return maker({ storage })
	}
}

function isProjectFactory(value: unknown): boolean {
	return typeof value === 'function' && isDeclaration((value as { dialecte?: unknown }).dialecte)
}

/** A `defineDialecte` result: identity, configs, default key, hooks factory. */
function isDeclaration(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Record<string, unknown>
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.version === 'string' &&
		typeof candidate.configs === 'object' &&
		typeof candidate.defaultConfigKey === 'string' &&
		typeof candidate.createHooks === 'function'
	)
}
