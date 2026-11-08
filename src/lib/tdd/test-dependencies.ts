/**
 * The test code a test file depends on: the test-code files it imports (relative, tsconfig `paths` or vite
 * alias, barrels and re-exports followed) through test code; the specifiers that look local and resolve
 * nowhere; the files of the change whose name the text of its test code holds (a fixture read from disk),
 * or the text of a production module its test code imports directly (a constant naming a fixture: one hop
 * into production, never further; the module itself is production, not a dependency); and its own
 * snapshot file; and the files of the change an `import.meta.glob` of its test code matches (a negated
 * pattern leaves its files out, and does not name them). Every dependency found by import or glob is followed in turn, and one found by name when the
 * text names it with its folder (`fixtures/scan.ts`, a full path): a bare file name (`index.ts`) may be
 * another file, so it is a dependency but not followed. A red run freezes a helper only through a file
 * that depends on it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, posix } from 'node:path'

import { matchesGlob } from './match-glob.ts'
import { isPackageTestCode } from './tdd-files.ts'
import { NEGATED_GLOB_PREFIX, SOURCE_FILE_PATTERN } from './tdd.constants.ts'
import { metaGlobs, moduleSpecifiers } from './test-source.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { MetaGlob, ModuleResolver } from './tdd.types.ts'

export function listTestDependencies(params: {
	root: string
	/** The test file, relative to the root. */
	file: string
	/** The test-code files of the change, relative to the root. */
	changedTestCode: readonly string[]
	resolveModule: ModuleResolver
	/** Its declared production folders; none when not given. */
	packageJson?: PackageJson
}): { dependencies: string[]; unresolved: string[] } {
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
				if (isPackageTestCode({ file: resolved, packageJson: params.packageJson ?? {} })) {
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
