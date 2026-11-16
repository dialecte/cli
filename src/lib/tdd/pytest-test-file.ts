/**
 * Whether pytest collects a file of the package as a test module, decided as its discovery decides it (pytest 8 and
 * 9), from the file's pytest folder and the configuration it holds (`resolvePytestConfig`):
 * - discovery starts at each `testpaths` entry (relative to the folder, a glob as Python's `glob` reads it), or at
 *   the folder itself when none is declared or none names a path that exists;
 * - below a start, it never enters a folder `norecursedirs` matches, a virtual environment (`pyvenv.cfg`,
 *   `conda-meta/history`) or `__pycache__`;
 * - it collects a `.py` file `python_files` matches (by its name, or by its path when the pattern holds a `/`), and a
 *   `testpaths` entry naming the file itself whatever its name.
 * A conftest's `collect_ignore`, `collect_ignore_glob` or `pytest_ignore_collect` is code: the cli's pytest plugin
 * applies it in a run, where such a file reports no module.
 */
import { existsSync, globSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { resolvePytestConfig } from './package-python.ts'
import {
	GLOB_MAGIC_PATTERN,
	PYTHON_CACHE_FOLDER,
	PYTHON_FILE_PATTERN,
	VIRTUAL_ENVIRONMENT_MARKERS,
} from './tdd.constants.ts'

/** The file (relative to the package root) is a test module pytest collects from its pytest folder. */
export function isPytestTestFile(params: { root: string; file: string }): boolean {
	if (!PYTHON_FILE_PATTERN.test(params.file)) return false
	const { folder, config } = resolvePytestConfig(params)
	const path = resolve(params.root, params.file)
	const starts = discoveryStarts({ folder, testpaths: config.testpaths, path })
	return starts.some(
		(start) =>
			start === path ||
			(config.pythonFiles.some((pattern) => matchesPathPattern({ pattern, path })) &&
				!holdsSkippedFolder({ start, path, patterns: config.norecursedirs })),
	)
}

/**
 * Where discovery starts that holds the file (itself included): the `testpaths` entries that name it or a folder
 * above it; the pytest folder when no entry names a path that exists. Empty: discovery never reaches the file.
 */
function discoveryStarts(params: {
	folder: string
	testpaths: readonly string[]
	path: string
}): string[] {
	const { folder, path } = params
	let anyFound = false
	const starts: string[] = []
	for (const entry of params.testpaths) {
		const absolute = resolve(folder, entry)
		if (!GLOB_MAGIC_PATTERN.test(entry)) {
			if (!existsSync(absolute)) continue
			anyFound = true
			if (isAtOrBelow({ path, folder: absolute })) starts.push(absolute)
			continue
		}
		const matched = ancestorsOf(path).filter((candidate) =>
			matchesGlobPath({ glob: absolute, path: candidate }),
		)
		starts.push(...matched)
		if (matched.length > 0 || globSync(entry, { cwd: folder }).length > 0) anyFound = true
	}
	return anyFound ? starts : [folder]
}

/** The path and every folder above it. */
function ancestorsOf(path: string): string[] {
	const found = [path]
	for (let folder = dirname(path); folder !== dirname(folder); folder = dirname(folder))
		found.push(folder)
	return found
}

function isAtOrBelow(params: { path: string; folder: string }): boolean {
	return params.path === params.folder || params.path.startsWith(`${params.folder}${sep}`)
}

/**
 * A folder between the start (left out) and the file that discovery does not enter: `__pycache__`, a virtual
 * environment, or one a `norecursedirs` pattern matches.
 */
function holdsSkippedFolder(params: {
	start: string
	path: string
	patterns: readonly string[]
}): boolean {
	for (
		let folder = dirname(params.path);
		folder !== params.start && isAtOrBelow({ path: folder, folder: params.start });
		folder = dirname(folder)
	) {
		if (basename(folder) === PYTHON_CACHE_FOLDER) return true
		if (VIRTUAL_ENVIRONMENT_MARKERS.some((marker) => existsSync(join(folder, ...marker))))
			return true
		if (params.patterns.some((pattern) => matchesPathPattern({ pattern, path: folder })))
			return true
	}
	return false
}

/**
 * pytest's `fnmatch_ex`: a pattern with no `/` matches the last name of the path, one with a `/` the whole path
 * (a relative one anywhere at its end); `*` crosses `/` as Python's `fnmatch` lets it.
 */
function matchesPathPattern(params: { pattern: string; path: string }): boolean {
	const { pattern, path } = params
	if (!pattern.includes('/')) return fnmatchExpression(pattern).test(basename(path))
	const whole = isAbsolute(pattern) ? pattern : `*/${pattern}`
	return fnmatchExpression(whole).test(path.split(sep).join('/'))
}

/** Python's `fnmatch.translate`: `*` any characters, `?` one, `[...]` a set (`[!...]` its complement). */
function fnmatchExpression(pattern: string): RegExp {
	return new RegExp(`^${patternSource({ pattern, star: '.*', anyCharacter: '.' })}$`, 's')
}

/**
 * The glob matches the path as Python's `glob` matches it: part by part, `*` and `?` within a part, a part starting
 * with `.` only by a pattern part starting with `.`, `**` any number of parts.
 */
function matchesGlobPath(params: { glob: string; path: string }): boolean {
	const globParts = params.glob.split(sep).filter(Boolean)
	const pathParts = params.path.split(sep).filter(Boolean)
	return matchParts({ globParts, pathParts })
}

function matchParts(params: { globParts: string[]; pathParts: string[] }): boolean {
	const [glob, ...globRest] = params.globParts
	const [part, ...pathRest] = params.pathParts
	if (glob === undefined) return part === undefined
	if (glob === '**')
		return (
			matchParts({ globParts: globRest, pathParts: params.pathParts }) ||
			(part !== undefined &&
				!part.startsWith('.') &&
				matchParts({ globParts: params.globParts, pathParts: pathRest }))
		)
	if (part === undefined) return false
	if (part.startsWith('.') && !glob.startsWith('.') && GLOB_MAGIC_PATTERN.test(glob)) return false
	const expression = new RegExp(
		`^${patternSource({ pattern: glob, star: '[^/]*', anyCharacter: '[^/]' })}$`,
		's',
	)
	return expression.test(part) && matchParts({ globParts: globRest, pathParts: pathRest })
}

/** A pattern's regular expression source: `*`, `?` and `[...]` as given, every other character itself. */
function patternSource(params: { pattern: string; star: string; anyCharacter: string }): string {
	const { pattern } = params
	let source = ''
	for (let index = 0; index < pattern.length; index++) {
		const character = pattern[index] as string
		if (character === '*') source += params.star
		else if (character === '?') source += params.anyCharacter
		else if (character === '[') {
			let end = index + 1
			if (pattern[end] === '!') end++
			if (pattern[end] === ']') end++
			while (end < pattern.length && pattern[end] !== ']') end++
			if (end >= pattern.length) source += '\\['
			else {
				let set = pattern.slice(index + 1, end).replaceAll('\\', '\\\\')
				if (set.startsWith('!')) set = `^${set.slice(1)}`
				else if (set.startsWith('^')) set = `\\${set}`
				source += `[${set}]`
				index = end
			}
		} else source += character.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
	}
	return source
}
