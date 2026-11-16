/**
 * The suite infrastructure of a package: the files its vitest configs name in `setupFiles` and `globalSetup`, and the
 * test helpers they import (followed through test code, never into production nor a test file), except a helper test
 * files other than its own unit test reach too (directly, or through another helper): an assertion helper the setup also reads stays test code, so a lot
 * cannot turn what its tests assert with into production by importing it from a setup file. A lot fixing them
 * fixes the suite, not a test: tdd counts them as production, so a red run never freezes them and a fix there after
 * the red is the green side. Read from the configs, no config field; read again only when a vite, vitest or tsconfig
 * file or one of the infrastructure files changed (size or modification time), and every time while a setup file
 * imports a local file that does not exist yet (it may be written next).
 *
 * The readings are kept in this module for the process: the cli runs one command per process, so they live for one
 * command; a longer process (the suite) gets a fresh reading whenever a config or infrastructure file changes, and a
 * new root is read on its own. A test file added later that imports an infrastructure helper is not part of the
 * signature: within one command the tree does not change.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, sep } from 'node:path'

import { createModuleResolver } from './module-resolver.ts'
import { listPackageFiles } from './package-files.ts'
import {
	MODULE_EXTENSION_PATTERN,
	TEST_FILE_PATTERN,
	TSCONFIG_FILE_PATTERN,
	VITE_CONFIG_FILE_PATTERN,
	VITEST_CONFIG_FILE_PATTERN,
} from './tdd.constants.ts'
import { moduleSpecifiers } from './test-source.ts'
import { writtenNameOf } from './written-name.ts'

import type { ModuleResolver, SourceText, SuiteInfrastructureReading } from './tdd.types.ts'

/** The last reading of each package root, kept while its configs and infrastructure files stay as read. */
const readings = new Map<string, SuiteInfrastructureReading>()

/**
 * The suite infrastructure of the package at `root` (paths relative to it); `isTestSupport` tells the test code a
 * setup file may import (a helper by its path), which is followed.
 */
export function listSuiteInfrastructure(params: {
	root: string
	isTestSupport: (file: string) => boolean
}): ReadonlySet<string> {
	const { root } = params
	const configs = listConfigFiles({ root })
	const known = readings.get(root)
	if (known && known.signature === signatureOf({ root, files: [...configs, ...known.files] }))
		return known.files
	const { files, complete } = readInfrastructure(params)
	if (complete)
		readings.set(root, { files, signature: signatureOf({ root, files: [...configs, ...files] }) })
	else readings.delete(root)
	return files
}

/**
 * The setup and global setup files, then every test helper they reach by import; complete unless an import that looks
 * local resolves to no file.
 */
function readInfrastructure(params: { root: string; isTestSupport: (file: string) => boolean }): {
	files: ReadonlySet<string>
	complete: boolean
} {
	const { root } = params
	const resolveModule = createModuleResolver({ root })
	const files = new Set([...resolveModule.setupFiles, ...resolveModule.globalSetupFiles])
	const isShared = createSharedHelperTest({
		entries: new Set(files),
		root,
		resolveModule,
		isTestSupport: params.isTestSupport,
	})
	const queue = [...files]
	let complete = true
	while (queue.length > 0) {
		const current = queue.shift() ?? ''
		const text = readFileSync(join(root, current), 'utf8')
		for (const specifier of moduleSpecifiers({ text, file: current })) {
			const resolution = resolveModule({ specifier, from: current })
			if (resolution.kind === 'unresolved') complete = false
			if (resolution.kind !== 'local') continue
			const file = resolution.file.split(sep).join(posix.sep)
			if (files.has(file) || TEST_FILE_PATTERN.test(file) || !params.isTestSupport(file)) continue
			if (isShared(file)) continue
			files.add(file)
			queue.push(file)
		}
	}
	return { files, complete }
}

/**
 * Whether test files other than the helper's own unit test (`<helper>.test.ts` beside it) reach the helper: one imports
 * it, or imports a test helper that reaches it (followed back through the helpers that import it, a cycle ending, never
 * through a setup file: a guard's own test imports its setup, which does not make the setup's helpers test code). The
 * package's test files and helpers are read once, on the first question; each is searched for the helper's written
 * name before its imports are resolved. `isTestSupport` tells the helpers.
 */
function createSharedHelperTest(params: {
	root: string
	resolveModule: ModuleResolver
	isTestSupport: (file: string) => boolean
	/** The setup and global setup files: the walk back never goes through them (a guard's test imports its setup). */
	entries: ReadonlySet<string>
}): (helper: string) => boolean {
	const { root, resolveModule } = params
	let sources: { tests: SourceText[]; helpers: SourceText[] } | undefined
	const answers = new Map<string, boolean>()
	/** The sources among `candidates` that import `helper`, by the resolver. */
	function importersOf(search: {
		helper: string
		candidates: readonly SourceText[]
	}): SourceText[] {
		const { helper, candidates } = search
		const name = writtenNameOf(helper)
		return candidates.filter(
			({ file, text }) =>
				file !== helper &&
				text.includes(name) &&
				moduleSpecifiers({ text, file }).some((specifier) => {
					const resolution = resolveModule({ specifier, from: file })
					return (
						resolution.kind === 'local' && resolution.file.split(sep).join(posix.sep) === helper
					)
				}),
		)
	}
	/** Whether a test reaches the helper, not walking back through `visiting` (a cycle) nor through a setup file. */
	function reaches(walk: { helper: string; visiting: ReadonlySet<string> }): boolean {
		const { helper, visiting } = walk
		const reading = sources ?? { tests: [], helpers: [] }
		const ownTest = helper.replace(MODULE_EXTENSION_PATTERN, '')
		if (
			importersOf({ helper, candidates: reading.tests }).some(
				({ file }) => file.replace(TEST_FILE_PATTERN, '') !== ownTest,
			)
		)
			return true
		const next = new Set([...visiting, helper])
		return importersOf({ helper, candidates: reading.helpers }).some(
			({ file }) =>
				!next.has(file) && !params.entries.has(file) && reaches({ helper: file, visiting: next }),
		)
	}
	return function isShared(helper: string): boolean {
		sources ??= readSources({ root, isTestSupport: params.isTestSupport })
		// only a whole answer is kept: a walk cut by a cycle answers its start alone
		const shared = answers.get(helper) ?? reaches({ helper, visiting: new Set() })
		answers.set(helper, shared)
		return shared
	}
}

/** The package's test files and its test helpers (JS/TS source), with their texts. */
function readSources(params: { root: string; isTestSupport: (file: string) => boolean }): {
	tests: SourceText[]
	helpers: SourceText[]
} {
	const files = listPackageFiles(params.root)
	/** The file with its text. */
	function sourceOf(file: string): SourceText {
		return { file, text: readFileSync(join(params.root, file), 'utf8') }
	}
	return {
		tests: files.filter((file) => TEST_FILE_PATTERN.test(file)).map(sourceOf),
		helpers: files
			.filter(
				(file) =>
					!TEST_FILE_PATTERN.test(file) &&
					MODULE_EXTENSION_PATTERN.test(file) &&
					params.isTestSupport(file),
			)
			.map(sourceOf),
	}
}

/** The vite, vitest and tsconfig files of the root (the resolver reads `paths` there), sorted. */
function listConfigFiles(params: { root: string }): string[] {
	try {
		return readdirSync(params.root)
			.filter(
				(name) =>
					VITEST_CONFIG_FILE_PATTERN.test(name) ||
					VITE_CONFIG_FILE_PATTERN.test(name) ||
					TSCONFIG_FILE_PATTERN.test(name),
			)
			.sort()
	} catch {
		return []
	}
}

/** Each file with its size and modification time (`-` once gone), one line each. */
function signatureOf(params: { root: string; files: readonly string[] }): string {
	return params.files
		.map(function stampOf(file) {
			try {
				const stat = statSync(join(params.root, file))
				return `${file} ${stat.size} ${stat.mtimeMs}`
			} catch {
				return `${file} -`
			}
		})
		.join('\n')
}
