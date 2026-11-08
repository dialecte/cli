/**
 * Resolves what a test file imports to a file of the package: relative paths, the package's tsconfig
 * `paths` (every tsconfig of the package root, `extends` followed), and vite's `resolve.alias` (a string,
 * or the path literal of a call such as `fileURLToPath(new URL('./src', import.meta.url))`), a Vite import
 * query or fragment (`?worker&url`, `?raw`, `#part`) left out of the file it names; and an `import.meta.glob`
 * pattern to a glob over the package's files (`resolveGlob`). A bare
 * package name is a dependency, never test code; a specifier that looks local (`#`, `~/`, `@/`, a paths
 * or alias prefix) and resolves nowhere is answered as unresolved.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, posix, relative, resolve, sep } from 'node:path'

import {
	LOCAL_SPECIFIER_PATTERN,
	MODULE_EXTENSIONS,
	SPECIFIER_QUERY_PATTERN,
	TEST_CONFIG_FILES,
	TSCONFIG_FILE_PATTERN,
} from './tdd.constants.ts'

import ts from 'typescript'

import type { ModuleAlias, ModuleResolution, ModuleResolver } from './tdd.types.ts'

export function createModuleResolver(params: { root: string }): ModuleResolver {
	const root = resolve(params.root)
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
	return Object.assign(resolveModule, { resolveGlob })
	function resolveModule(params: { specifier: string; from: string }): ModuleResolution {
		// the file a Vite query or fragment names (`./x.worker?worker&url`): the query is no part of its path
		const specifier = params.specifier.replace(SPECIFIER_QUERY_PATTERN, '')
		const absoluteFrom = join(root, params.from)
		if (specifier.startsWith('.') || isAbsolute(specifier))
			return localOrUnresolved({ root, path: resolve(dirname(absoluteFrom), specifier) })
		for (const options of compilerOptions) {
			const resolved = ts.resolveModuleName(specifier, absoluteFrom, options, ts.sys).resolvedModule
			if (resolved && !resolved.isExternalLibraryImport) {
				const local = localOrUnresolved({ root, path: resolved.resolvedFileName })
				if (local.kind === 'local') return local
			}
		}
		const matching = aliasesOfSpecifier(specifier)
		for (const alias of matching) {
			const local = localOrUnresolved({
				root,
				path: join(alias.replacement, specifier.slice(alias.find.length)),
			})
			if (local.kind === 'local') return local
		}
		const looksLocal =
			LOCAL_SPECIFIER_PATTERN.test(specifier) ||
			pathPrefixes.some((prefix) => prefix && specifier.startsWith(prefix)) ||
			matching.length > 0
		return looksLocal ? { kind: 'unresolved' } : { kind: 'package' }
	}
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
	const aliases: ModuleAlias[] = []
	for (const name of TEST_CONFIG_FILES) {
		const path = join(root, name)
		if (!existsSync(path)) continue
		const source = ts.createSourceFile(
			name,
			readFileSync(path, 'utf8'),
			ts.ScriptTarget.Latest,
			true,
		)
		function visit(node: ts.Node): void {
			if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'alias')
				aliases.push(...aliasesOf({ root, value: node.initializer }))
			ts.forEachChild(node, visit)
		}
		visit(source)
	}
	return aliases
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

function fieldOf(params: {
	object: ts.ObjectLiteralExpression
	key: string
}): ts.Expression | undefined {
	return params.object.properties.find(
		(property): property is ts.PropertyAssignment =>
			ts.isPropertyAssignment(property) && propertyName(property.name) === params.key,
	)?.initializer
}

/** A path written in the expression: the string itself, or the last path-like string literal inside it. */
function pathLiteralOf(expression: ts.Expression): string | undefined {
	if (ts.isStringLiteralLike(expression)) return expression.text
	let found: string | undefined
	function visit(node: ts.Node): void {
		if (ts.isStringLiteralLike(node) && /^\.{0,2}\//.test(node.text)) found = node.text
		ts.forEachChild(node, visit)
	}
	visit(expression)
	return found
}

function propertyName(name: ts.PropertyName): string | undefined {
	return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined
}

/** The file a path names (with an extension added, or a folder's index), inside the root. */
function localOrUnresolved(params: { root: string; path: string }): ModuleResolution {
	const base = normalize(params.path)
	const candidates = [
		base,
		...MODULE_EXTENSIONS.map((extension) => `${base}${extension}`),
		...MODULE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
	]
	const found = candidates.find(isFile)
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
