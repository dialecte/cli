/**
 * Resolves what a test file imports to a file of the package: relative paths, the package's tsconfig
 * `paths` (every tsconfig of the package root, `extends` followed), and vite's `resolve.alias` (a string,
 * or the path literal of a call such as `fileURLToPath(new URL('./src', import.meta.url))`), a Vite import
 * query or fragment (`?worker&url`, `?raw`, `#part`) left out of the file it names; and an `import.meta.glob`
 * pattern to a glob over the package's files (`resolveGlob`). A bare
 * package name is a dependency, never test code; a specifier that looks local (`#`, `~/`, `@/`, a paths
 * or alias prefix) and resolves nowhere is answered as unresolved.
 */
import { readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, posix, relative, resolve, sep } from 'node:path'

import {
	LOCAL_SPECIFIER_PATTERN,
	MODULE_EXTENSIONS,
	GLOBAL_SETUP_PROPERTY,
	SETUP_FILES_PROPERTY,
	SPECIFIER_QUERY_PATTERN,
	TSCONFIG_FILE_PATTERN,
} from './tdd.constants.ts'
import {
	configPathsOf,
	configPropertiesOf,
	fieldOf,
	pathLiteralOf,
	propertyName,
} from './vitest-configs.ts'

import ts from 'typescript'

import type {
	ModuleAlias,
	ModuleResolution,
	ModuleResolver,
	ModuleResolverHost,
} from './tdd.types.ts'

export function createModuleResolver(params: {
	root: string
	/** The files the resolver sees (a base's file set); the disk when left out. */
	host?: ModuleResolverHost
}): ModuleResolver {
	const root = resolve(params.root)
	// the files the resolver sees: a base's file set, else the disk
	const { isFileOf, moduleHost } = hostsOf(params.host)
	const compilerOptions = readPathsOptions(root)
	const pathPrefixes = compilerOptions.flatMap((options) =>
		Object.keys(options.paths ?? {}).map((key) => key.replace(/\*.*$/, '')),
	)
	const aliases = readViteAliases(root)
	/** The aliases whose prefix the specifier (or glob) starts with, in their order. */
	function aliasesOfSpecifier(specifier: string): ModuleAlias[] {
		return aliases.filter(
			(alias) => specifier === alias.find || specifier.startsWith(`${alias.find}/`),
		)
	}
	/** Vite's glob forms: relative to the importing file, `/` for the package root, or an alias prefix. */
	function resolveGlob(params: { pattern: string; from: string }): string | undefined {
		const { pattern } = params
		const [alias] = aliasesOfSpecifier(pattern)
		const absolute = pattern.startsWith('.')
			? join(root, dirname(params.from), pattern)
			: pattern.startsWith('/')
				? join(root, pattern)
				: alias
					? join(alias.replacement, pattern.slice(alias.find.length))
					: undefined
		if (absolute === undefined) return undefined
		const glob = relative(root, absolute).split(sep).join(posix.sep)
		return glob.startsWith('..') ? undefined : glob
	}
	return Object.assign(resolveModule, {
		resolveGlob,
		setupFiles: readConfigFiles({ root, property: SETUP_FILES_PROPERTY }),
		globalSetupFiles: readConfigFiles({ root, property: GLOBAL_SETUP_PROPERTY }),
		unreadableSetup: [SETUP_FILES_PROPERTY, GLOBAL_SETUP_PROPERTY].flatMap(
			(property) => configPathsOf({ root, property }).unreadable,
		),
	})
	function resolveModule(params: { specifier: string; from: string }): ModuleResolution {
		// the file a Vite query or fragment names (`./x.worker?worker&url`): the query is no part of its path
		const specifier = params.specifier.replace(SPECIFIER_QUERY_PATTERN, '')
		const absoluteFrom = join(root, params.from)
		if (specifier.startsWith('.') || isAbsolute(specifier))
			return localOrUnresolved({
				root,
				path: resolve(dirname(absoluteFrom), specifier),
				isFile: isFileOf,
			})
		const matching = aliasesOfSpecifier(specifier)
		const mapped = resolveMapped({
			root,
			specifier,
			absoluteFrom,
			compilerOptions,
			aliases: matching,
			isFile: isFileOf,
			moduleHost,
		})
		if (mapped !== undefined) return mapped
		const looksLocal =
			LOCAL_SPECIFIER_PATTERN.test(specifier) ||
			pathPrefixes.some((prefix) => prefix && specifier.startsWith(prefix)) ||
			matching.length > 0
		return looksLocal ? { kind: 'unresolved' } : { kind: 'package' }
	}
}

/**
 * The local file a mapped specifier names: through the tsconfig `paths` of `compilerOptions`, then through the Vite
 * `aliases` it starts with, each checked against the files `isFile` sees; undefined when none names one.
 */
function resolveMapped(params: {
	root: string
	specifier: string
	absoluteFrom: string
	compilerOptions: readonly ts.CompilerOptions[]
	aliases: readonly ModuleAlias[]
	isFile: (path: string) => boolean
	moduleHost: ts.ModuleResolutionHost
}): ModuleResolution | undefined {
	const { root, specifier, isFile } = params
	for (const options of params.compilerOptions) {
		const resolved = ts.resolveModuleName(
			specifier,
			params.absoluteFrom,
			options,
			params.moduleHost,
		).resolvedModule
		if (resolved && !resolved.isExternalLibraryImport) {
			const local = localOrUnresolved({ root, path: resolved.resolvedFileName, isFile })
			if (local.kind === 'local') return local
		}
	}
	for (const alias of params.aliases) {
		const path = join(alias.replacement, specifier.slice(alias.find.length))
		const local = localOrUnresolved({ root, path, isFile })
		if (local.kind === 'local') return local
	}
	return undefined
}

/** The compiler options of every tsconfig of the root that maps `paths`. */
function readPathsOptions(root: string): ts.CompilerOptions[] {
	const files = readdirSync(root)
		.filter((name) => TSCONFIG_FILE_PATTERN.test(name))
		.sort()
	return files.flatMap(function parse(name) {
		const read = ts.readConfigFile(join(root, name), ts.sys.readFile)
		if (read.error) return []
		const parsed = ts.parseJsonConfigFileContent(
			read.config,
			ts.sys,
			root,
			undefined,
			join(root, name),
		)
		return parsed.options.paths ? [parsed.options] : []
	})
}

/** `resolve.alias` of the package's vite or vitest config: an object of string keys, or `{ find, replacement }` entries. */
function readViteAliases(root: string): ModuleAlias[] {
	return configPropertiesOf({ root, property: 'alias' }).flatMap((value) =>
		aliasesOf({ root, value }),
	)
}

/**
 * The files a config property (`setupFiles`, `globalSetup`) of the package's vite or vitest configs names (every
 * project's; `configPathsOf` follows lists, spreads and same-file consts), each relative to the package root, as the
 * files of the package they name, sorted, each once; a path naming no file is left out.
 */
function readConfigFiles(params: { root: string; property: string }): string[] {
	const { root } = params
	const files = configPathsOf(params).paths.flatMap(function setupFileOf(path) {
		const resolution = localOrUnresolved({ root, path: resolve(root, path), isFile })
		return resolution.kind === 'local' ? [resolution.file.split(sep).join(posix.sep)] : []
	})
	return [...new Set(files)].sort()
}

function aliasesOf(params: { root: string; value: ts.Expression }): ModuleAlias[] {
	const { root, value } = params
	const entries: Array<{ find: string | undefined; replacement: ts.Expression | undefined }> = []
	if (ts.isObjectLiteralExpression(value))
		for (const property of value.properties)
			if (ts.isPropertyAssignment(property))
				entries.push({ find: propertyName(property.name), replacement: property.initializer })
	if (ts.isArrayLiteralExpression(value))
		for (const element of value.elements)
			if (ts.isObjectLiteralExpression(element)) {
				const find = fieldOf({ object: element, key: 'find' })
				entries.push({
					find: find && ts.isStringLiteralLike(find) ? find.text : undefined,
					replacement: fieldOf({ object: element, key: 'replacement' }),
				})
			}
	return entries.flatMap((entry) => {
		const target = entry.replacement ? pathLiteralOf(entry.replacement) : undefined
		return entry.find && target ? [{ find: entry.find, replacement: resolve(root, target) }] : []
	})
}

/** The file a path names (with an extension added, or a folder's index), inside the root. */
function localOrUnresolved(params: {
	root: string
	path: string
	isFile: (path: string) => boolean
}): ModuleResolution {
	const base = normalize(params.path)
	const candidates = [
		base,
		...MODULE_EXTENSIONS.map((extension) => `${base}${extension}`),
		...MODULE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
	]
	const found = candidates.find(params.isFile)
	if (!found) return { kind: 'unresolved' }
	const file = relative(params.root, found)
	return file.startsWith('..') || file.startsWith('node_modules/')
		? { kind: 'package' }
		: { kind: 'local', file }
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile()
	} catch {
		return false
	}
}

/**
 * A host over `files` (relative to `root`): the resolver sees those files, never the disk.
 *
 * @intent resolve imports over another commit's file set
 * @internal
 */
export function fileSetHost(params: { root: string; files: Iterable<string> }): ModuleResolverHost {
	const known = new Set([...params.files].map((file) => resolve(params.root, file)))
	return {
		isFile: function isKnownFile(path: string): boolean {
			return known.has(resolve(path))
		},
	}
}

/** The file check and the compiler's resolution host of `host`: the disk's when it is left out. */
function hostsOf(host: ModuleResolverHost | undefined): {
	isFileOf: (path: string) => boolean
	moduleHost: ts.ModuleResolutionHost
} {
	if (host === undefined) return { isFileOf: isFile, moduleHost: ts.sys }
	return {
		isFileOf: host.isFile,
		moduleHost: { fileExists: host.isFile, readFile: ts.sys.readFile },
	}
}
