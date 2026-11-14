/**
 * The vitest configs of a package, read as files with the TypeScript AST: which `vitest*.config.*` (and the vite
 * config) exist, what each includes and excludes, which configs and inline projects it lists, and so which config
 * holds a test file. The one config parser of the package: the module resolver reads `resolve.alias` and
 * `setupFiles` through `configPropertiesOf` and the field readers here.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import { matchesGlob } from './match-glob.ts'
import {
	DEFAULT_CONFIG_FILES,
	DEFAULT_VITEST_EXCLUDE,
	DEFAULT_VITEST_INCLUDE,
	TEST_CONFIG_FILES,
	VITE_CONFIG_FILE_PATTERN,
	VITEST_CONFIG_FILE_PATTERN,
	VITEST_CONFIG_PROPERTIES,
} from './tdd.constants.ts'

import ts from 'typescript'

import type {
	ConfigHolding,
	ConfigList,
	PathHolding,
	VitestConfig,
	VitestConfigs,
	VitestGlobs,
} from './tdd.types.ts'

/** Every vitest config of the package root, with the default config (the one a run with no `--config` reads). */
export function readVitestConfigs(params: { root: string }): VitestConfigs {
	const { root } = params
	const names = readdirSync(root)
		.filter((name) => VITEST_CONFIG_FILE_PATTERN.test(name) || VITE_CONFIG_FILE_PATTERN.test(name))
		.sort()
	const defaultConfig = DEFAULT_CONFIG_FILES.find((name) => names.includes(name))
	const configs = names.flatMap(function configOf(name): VitestConfig[] {
		const source = parseConfigFile({ root, name })
		if (!source) return []
		const rootObject = configObjectOf(source)
		const testValue = rootObject
			? fieldOf({ object: rootObject, key: VITEST_CONFIG_PROPERTIES.test })
			: undefined
		// a vite config with no `test` is an app's config: a vitest config only when the default run reads it
		if (testValue === undefined && VITE_CONFIG_FILE_PATTERN.test(name) && name !== defaultConfig)
			return []
		const testObject = rootObject
			? objectFieldOf({ object: rootObject, key: VITEST_CONFIG_PROPERTIES.test })
			: undefined
		return [{ file: name, ...projectsOf(testObject), ...testGlobsOf(rootObject) }]
	})
	return { configs, defaultConfig }
}

/**
 * Which config holds `path` (relative to the root): the default one, another one, none, or unknown. Unknown fails
 * closed: the default config's reading is unknown (the file is not "another config's" then), or no config holds it
 * while one may (an unread list or project).
 */
export function configHolding(params: { configs: VitestConfigs; path: string }): ConfigHolding {
	const { configs, path } = params
	const byFile = new Map(configs.configs.map((config) => [config.file, config]))
	const defaultConfig =
		configs.defaultConfig === undefined ? undefined : byFile.get(configs.defaultConfig)
	const heldByDefault = defaultConfig
		? configHolds({ config: defaultConfig, byFile, path, visited: new Set() })
		: globsHold({ ...defaultGlobs(), path })
	if (heldByDefault === true) return { kind: 'default' }
	if (heldByDefault === 'unknown') return { kind: 'unknown' }
	const others = configs.configs
		.filter((config) => config !== defaultConfig)
		.map((config) => ({
			config,
			holds: configHolds({ config, byFile, path, visited: new Set() }),
		}))
	const other = others.find((each) => each.holds === true)
	if (other) return { kind: 'other', config: other.config.file }
	return others.some((each) => each.holds === 'unknown') ? { kind: 'unknown' } : { kind: 'none' }
}

/**
 * The config runs `path`: through its projects when it lists any (a config file named, an inline project with its
 * own globs), else through its own include and exclude. Unknown when no project holds it and one may: an unread
 * entry, a path naming no config read at the root.
 */
function configHolds(params: {
	config: VitestConfig
	byFile: ReadonlyMap<string, VitestConfig>
	path: string
	/** The config files already followed: a project list naming its own config ends there. */
	visited: Set<string>
}): PathHolding {
	const { config, byFile, path, visited } = params
	if (visited.has(config.file)) return false
	visited.add(config.file)
	if (config.projects.length === 0 && config.inlineProjects.length === 0 && !config.projectsUnread)
		return globsHold({ ...config, path })
	const holdings = [
		...config.inlineProjects.map((project) => globsHold({ ...project, path })),
		...config.projects.map(function projectHolds(file): PathHolding {
			const project = byFile.get(file)
			return project === undefined
				? 'unknown'
				: configHolds({ config: project, byFile, path, visited })
		}),
	]
	if (holdings.includes(true)) return true
	return config.projectsUnread || holdings.includes('unknown') ? 'unknown' : false
}

/**
 * An include glob matches the path and no exclude glob does (`{a,b}` alternatives expanded); unknown when an unread
 * include may match it, or an unread exclude may leave it out.
 */
function globsHold(params: VitestGlobs & { path: string }): PathHolding {
	const { path } = params
	function matches(glob: string): boolean {
		return expandBraces(glob).some((each) => matchesGlob({ path, glob: each }))
	}
	if (params.exclude.some(matches)) return false
	if (params.include.some(matches)) return params.excludeUnread ? 'unknown' : true
	return params.includeUnread ? 'unknown' : false
}

/** `{a,b}` alternatives (nested too, an empty one allowed) as the globs they stand for. */
function expandBraces(glob: string): string[] {
	const open = glob.indexOf('{')
	if (open < 0) return [glob]
	let depth = 0
	const commas: number[] = []
	for (let index = open; index < glob.length; index++) {
		const character = glob[index]
		if (character === '{') depth++
		else if (character === '}' && --depth === 0) {
			const bounds = [open, ...commas, index]
			const alternatives = bounds.slice(1).map((end, at) => glob.slice(bounds[at] + 1, end))
			const rest = glob.slice(index + 1)
			return alternatives.flatMap((alternative) =>
				expandBraces(`${glob.slice(0, open)}${alternative}${rest}`),
			)
		} else if (character === ',' && depth === 1) commas.push(index)
	}
	// an unclosed brace is itself
	return [glob]
}

/**
 * The globs of the `test` field of a config's object or an inline project: vitest's defaults where it sets none;
 * unread when there is no object to read or its `test` is no object literal.
 */
function testGlobsOf(object: ts.ObjectLiteralExpression | undefined): VitestGlobs {
	const testValue = object ? fieldOf({ object, key: VITEST_CONFIG_PROPERTIES.test }) : undefined
	if (!object || (testValue !== undefined && !ts.isObjectLiteralExpression(testValue)))
		return { include: [], exclude: [], includeUnread: true, excludeUnread: true }
	if (testValue === undefined) return defaultGlobs()
	const include = stringsOf(fieldOf({ object: testValue, key: VITEST_CONFIG_PROPERTIES.include }))
	const exclude = stringsOf(fieldOf({ object: testValue, key: VITEST_CONFIG_PROPERTIES.exclude }))
	return {
		include: include?.strings ?? [...DEFAULT_VITEST_INCLUDE],
		exclude: exclude?.strings ?? [...DEFAULT_VITEST_EXCLUDE],
		includeUnread: include?.unread ?? false,
		excludeUnread: exclude?.unread ?? false,
	}
}

/** vitest's default include and exclude, fully read. */
function defaultGlobs(): VitestGlobs {
	return {
		include: [...DEFAULT_VITEST_INCLUDE],
		exclude: [...DEFAULT_VITEST_EXCLUDE],
		includeUnread: false,
		excludeUnread: false,
	}
}

/**
 * The config files a `test.projects` list names (relative to the root) and its inline projects' globs; unread when
 * the list is no array literal or holds an entry that is neither a string literal nor an object literal (a call, a
 * constant, a spread).
 */
function projectsOf(testObject: ts.ObjectLiteralExpression | undefined): {
	projects: string[]
	inlineProjects: VitestGlobs[]
	projectsUnread: boolean
} {
	const list = testObject
		? fieldOf({ object: testObject, key: VITEST_CONFIG_PROPERTIES.projects })
		: undefined
	const projects: string[] = []
	const inlineProjects: VitestGlobs[] = []
	if (!list) return { projects, inlineProjects, projectsUnread: false }
	if (!ts.isArrayLiteralExpression(list)) return { projects, inlineProjects, projectsUnread: true }
	let projectsUnread = false
	for (const element of list.elements) {
		// a glob string names no config read at the root: `configHolds` answers unknown for it
		if (ts.isStringLiteralLike(element)) projects.push(posix.normalize(element.text))
		else if (ts.isObjectLiteralExpression(element)) inlineProjects.push(testGlobsOf(element))
		else projectsUnread = true
	}
	return { projects, inlineProjects, projectsUnread }
}

/**
 * The string literals of a list, and whether it holds more (an element that is no string literal, or a value that is
 * no array literal); undefined when the field is absent.
 */
function stringsOf(value: ts.Expression | undefined): ConfigList | undefined {
	if (!value) return undefined
	if (!ts.isArrayLiteralExpression(value)) return { strings: [], unread: true }
	const strings = value.elements.flatMap((element) =>
		ts.isStringLiteralLike(element) ? [element.text] : [],
	)
	return { strings, unread: strings.length < value.elements.length }
}

/**
 * The object a config exports: the outermost object literal holding a `test` field inside the default export
 * (`defineConfig({...})`, `mergeConfig(base, {...})`, a function returning it, a variable naming it), else the
 * outermost object literal there.
 */
function configObjectOf(source: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
	const exported = source.statements.find(ts.isExportAssignment)?.expression
	if (!exported) return undefined
	const start = ts.isIdentifier(exported)
		? (variableValueOf({ source, name: exported.text }) ?? exported)
		: exported
	const objects: ts.ObjectLiteralExpression[] = []
	const queue: ts.Node[] = [start]
	// each variable expanded once: a recursive one (`const depth = (n) => depth(n - 1)`) would loop forever
	const expanded = new Set<string>(ts.isIdentifier(exported) ? [exported.text] : [])
	// breadth first: the outermost object comes first
	for (let node = queue.shift(); node; node = queue.shift()) {
		if (ts.isObjectLiteralExpression(node)) {
			objects.push(node)
			continue
		}
		if (ts.isIdentifier(node) && node !== start) {
			if (expanded.has(node.text)) continue
			expanded.add(node.text)
			const value = variableValueOf({ source, name: node.text })
			if (value) queue.push(value)
			continue
		}
		ts.forEachChild(node, (child) => {
			queue.push(child)
		})
	}
	return (
		objects.find(
			(object) => fieldOf({ object, key: VITEST_CONFIG_PROPERTIES.test }) !== undefined,
		) ?? objects[0]
	)
}

/** The initializer of the top-level variable `name` of the file. */
function variableValueOf(params: {
	source: ts.SourceFile
	name: string
}): ts.Expression | undefined {
	for (const statement of params.source.statements)
		if (ts.isVariableStatement(statement))
			for (const declaration of statement.declarationList.declarations)
				if (ts.isIdentifier(declaration.name) && declaration.name.text === params.name)
					return declaration.initializer
	return undefined
}

/** The field `key` of the object when its value is an object literal. */
function objectFieldOf(params: {
	object: ts.ObjectLiteralExpression
	key: string
}): ts.ObjectLiteralExpression | undefined {
	const value = fieldOf(params)
	return value && ts.isObjectLiteralExpression(value) ? value : undefined
}

/** The config file of the root, parsed; undefined when it does not exist. */
function parseConfigFile(params: { root: string; name: string }): ts.SourceFile | undefined {
	const path = join(params.root, params.name)
	if (!existsSync(path)) return undefined
	return ts.createSourceFile(params.name, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
}

/** The value of every assignment of `property` in the package's vite and vitest config files, in file order. */
export function configPropertiesOf(params: { root: string; property: string }): ts.Expression[] {
	const values: ts.Expression[] = []
	for (const name of TEST_CONFIG_FILES) {
		const source = parseConfigFile({ root: params.root, name })
		if (!source) continue
		function visit(node: ts.Node): void {
			if (ts.isPropertyAssignment(node) && propertyName(node.name) === params.property)
				values.push(node.initializer)
			ts.forEachChild(node, visit)
		}
		visit(source)
	}
	return values
}

/** The value of the field `key` written in the object itself (never a nested object's). */
export function fieldOf(params: {
	object: ts.ObjectLiteralExpression
	key: string
}): ts.Expression | undefined {
	return params.object.properties.find(
		(property): property is ts.PropertyAssignment =>
			ts.isPropertyAssignment(property) && propertyName(property.name) === params.key,
	)?.initializer
}

/** A path written in the expression: the string itself, or the last path-like string literal inside it. */
export function pathLiteralOf(expression: ts.Expression): string | undefined {
	if (ts.isStringLiteralLike(expression)) return expression.text
	let found: string | undefined
	function visit(node: ts.Node): void {
		if (ts.isStringLiteralLike(node) && /^\.{0,2}\//.test(node.text)) found = node.text
		ts.forEachChild(node, visit)
	}
	visit(expression)
	return found
}

export function propertyName(name: ts.PropertyName): string | undefined {
	return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined
}
