/**
 * The suite infrastructure of a package: the files its vitest configs name in `setupFiles` and `globalSetup`, and the
 * test helpers they import (followed through test code, never into production nor a test file), except a helper test
 * files other than its own unit test import too: an assertion helper the setup also reads stays test code, so a lot
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

import { listRepositoryFiles } from '../git.ts'
import { createModuleResolver } from './module-resolver.ts'
import {
	MODULE_EXTENSION_PATTERN,
	TEST_FILE_PATTERN,
	TSCONFIG_FILE_PATTERN,
	VITE_CONFIG_FILE_PATTERN,
	VITEST_CONFIG_FILE_PATTERN,
} from './tdd.constants.ts'
import { moduleSpecifiers } from './test-source.ts'
import { writtenNameOf } from './written-name.ts'

import type { ModuleResolver, SuiteInfrastructureReading } from './tdd.types.ts'

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
	const isShared = createSharedHelperTest({ root, resolveModule })
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
 * Whether a test file other than the helper's own unit test (`<helper>.test.ts` beside it) imports the helper: the
 * repository's test files read once, on the first question, each searched for the helper's written name before its
 * imports are resolved.
 */
function createSharedHelperTest(params: {
	root: string
	resolveModule: ModuleResolver
}): (helper: string) => boolean {
	const { root, resolveModule } = params
	let testFiles: Array<{ file: string; text: string }> | undefined
	return function isShared(helper) {
		testFiles ??= listRepositoryFiles({ root, folder: '.' })
			.filter((file) => TEST_FILE_PATTERN.test(file))
			.map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }))
		const name = writtenNameOf(helper)
		const ownTest = helper.replace(MODULE_EXTENSION_PATTERN, '')
		return testFiles.some(
			({ file, text }) =>
				file.replace(TEST_FILE_PATTERN, '') !== ownTest &&
				text.includes(name) &&
				moduleSpecifiers({ text, file }).some((specifier) => {
					const resolution = resolveModule({ specifier, from: file })
					return (
						resolution.kind === 'local' && resolution.file.split(sep).join(posix.sep) === helper
					)
				}),
		)
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
