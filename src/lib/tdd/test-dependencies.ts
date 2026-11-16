/**
 * The test code a test file depends on: the test-code files it imports (relative, tsconfig `paths` or vite
 * alias, barrels and re-exports followed) through test code; the specifiers that look local and resolve
 * nowhere; the files of the change whose name the text of its test code holds (a fixture read from disk),
 * or the text of a production module its test code imports directly (a constant naming a fixture: one hop
 * into production, never further; the module itself is production, not a dependency); and its own
 * snapshot file; and the files of the change an `import.meta.glob` of its test code matches (a negated
 * pattern leaves its files out, and does not name them). Every dependency found by import or glob is followed in turn, and one found by name when the
 * text names it with its folder (`fixtures/scan.ts`, a full path): a bare file name (`index.ts`) may be
 * another file, so it is a dependency but not followed. The setup files of the package's vitest config
 * (`setupFiles`, test code no test imports) are a dependency of every test file, followed as an import. A red run
 * freezes a helper only through a file that depends on it. A pytest test file is never parsed here: its
 * dependencies are the test code its run used, as the cli's pytest plugin reported it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, posix, relative } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { matchesGlob } from './match-glob.ts'
import { modulesOf } from './select-cases.ts'
import { isPackageTestCode } from './tdd-files.ts'
import { NEGATED_GLOB_PREFIX, PYTHON_FILE_PATTERN, SOURCE_FILE_PATTERN } from './tdd.constants.ts'
import { metaGlobs, moduleSpecifiers } from './test-source.ts'

import type { PackageJson } from '../package-json.types.ts'
import type {
	MetaGlob,
	ModuleResolver,
	ReportedModule,
	TestDependencies,
	TestDependenciesParams,
} from './tdd.types.ts'

export function listTestDependencies(params: TestDependenciesParams): TestDependencies {
	// a test file here is one already: a Python one is a pytest file
	if (PYTHON_FILE_PATTERN.test(params.file))
		return {
			dependencies: pythonDependencies({ ...params, modules: params.modules ?? [] }),
			unresolved: [],
		}
	return typescriptDependencies(params)
}

/** The test code a JS/TS test file depends on, read from its source and the sources it reaches. */
function typescriptDependencies(params: TestDependenciesParams): TestDependencies {
	const { root } = params
	const found = new Set<string>()
	const texts: string[] = []
	const unresolved = new Set<string>()
	const productionRead = new Set<string>()
	// the files read for imports and names: the test file, its imports, the names written with their folder
	const followed = new Set([params.file])
	// the import.meta.glob calls of the test code read, as globs over the package's files
	const globs: MetaGlob[] = []
	const queue = [params.file]
	// the vitest config's setup files run before every test file: test code no test imports, followed as an import
	for (const setupFile of params.resolveModule.setupFiles)
		if (
			setupFile !== params.file &&
			isPackageTestCode({ root, file: setupFile, packageJson: params.packageJson ?? {} })
		) {
			found.add(setupFile)
			followed.add(setupFile)
			queue.push(setupFile)
		}
	while (queue.length) {
		while (queue.length) {
			const current = queue.shift() ?? ''
			const text = readFileSync(join(root, current), 'utf8')
			if (!SOURCE_FILE_PATTERN.test(current)) {
				texts.push(text)
				continue
			}
			const written = metaGlobs({ text, file: current })
			// a negated pattern names a file the test does not read: no dependency by its name either
			texts.push(
				written
					.flatMap((glob) => glob.exclude)
					.reduce((rest, pattern) => rest.replaceAll(`${NEGATED_GLOB_PREFIX}${pattern}`, ''), text),
			)
			for (const glob of written)
				globs.push({
					include: resolvedGlobs({ patterns: glob.include, from: current, ...params }),
					exclude: resolvedGlobs({ patterns: glob.exclude, from: current, ...params }),
				})
			for (const specifier of moduleSpecifiers({ text, file: current })) {
				const resolution = params.resolveModule({ specifier, from: current })
				if (resolution.kind === 'unresolved') {
					unresolved.add(specifier)
					continue
				}
				if (resolution.kind !== 'local') continue
				const resolved = resolution.file
				if (resolved === params.file || found.has(resolved)) continue
				if (isPackageTestCode({ root, file: resolved, packageJson: params.packageJson ?? {} })) {
					found.add(resolved)
					followed.add(resolved)
					queue.push(resolved)
				} else if (!productionRead.has(resolved)) {
					// production imported by test code: its text may name a fixture, its imports are not followed
					productionRead.add(resolved)
					texts.push(readFileSync(join(root, resolved), 'utf8'))
				}
			}
		}
		for (const candidate of params.changedTestCode) {
			if (followed.has(candidate)) continue
			const withFolder = posix.join(basename(dirname(candidate)), basename(candidate))
			const globbed = globs.some(
				(glob) =>
					glob.include.some((pattern) => matchesGlob({ path: candidate, glob: pattern })) &&
					!glob.exclude.some((pattern) => matchesGlob({ path: candidate, glob: pattern })),
			)
			if (globbed || texts.some((text) => text.includes(withFolder))) {
				found.add(candidate)
				followed.add(candidate)
				queue.push(candidate)
			} else if (texts.some((text) => text.includes(basename(candidate)))) found.add(candidate)
		}
	}
	const snapshot = join(dirname(params.file), '__snapshots__', `${basename(params.file)}.snap`)
	if (existsSync(join(root, snapshot))) found.add(snapshot)
	return { dependencies: [...found].sort(), unresolved: [...unresolved].sort() }
}

/**
 * The test code a pytest test file used in its run, as the plugin reported it (conftests, helpers its imports
 * resolve to, files it opened), relative to the root: the production files and the files outside the package left
 * out, so production never freezes. A file the run did not report has none.
 */
function pythonDependencies(params: {
	root: string
	file: string
	modules: readonly ReportedModule[]
	packageJson?: PackageJson
}): string[] {
	const realRoot = realPathOf(params.root)
	const used = modulesOf(params).flatMap((testModule) => testModule.dependencies ?? [])
	const files = used
		.map((path) => relative(realRoot, realPathOf(path)))
		.filter(
			(file) =>
				file !== params.file &&
				!file.startsWith('..') &&
				!isAbsolute(file) &&
				isPackageTestCode({ root: params.root, file, packageJson: params.packageJson ?? {} }),
		)
	return [...new Set(files)].sort()
}

/** The patterns of an `import.meta.glob` call written in `from`, as globs over the package (the others dropped). */
function resolvedGlobs(params: {
	patterns: readonly string[]
	from: string
	resolveModule: ModuleResolver
}): string[] {
	return params.patterns.flatMap(function resolveOne(pattern) {
		const glob = params.resolveModule.resolveGlob({ pattern, from: params.from })
		return glob === undefined ? [] : [glob]
	})
}
