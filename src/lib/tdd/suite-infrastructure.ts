/**
 * The suite infrastructure of a package: the files its vitest configs name in `setupFiles` and `globalSetup`, and the
 * test helpers they import (followed through test code, never into production nor a test file). A lot fixing them
 * fixes the suite, not a test: tdd counts them as production, so a red run never freezes them and a fix there after
 * the red is the green side. Read from the configs, no config field; read again only when a config or one of the files
 * changed (size or modification time).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, sep } from 'node:path'

import { createModuleResolver } from './module-resolver.ts'
import {
	TEST_FILE_PATTERN,
	VITE_CONFIG_FILE_PATTERN,
	VITEST_CONFIG_FILE_PATTERN,
} from './tdd.constants.ts'
import { moduleSpecifiers } from './test-source.ts'

import type { SuiteInfrastructureReading } from './tdd.types.ts'

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
	const files = readInfrastructure(params)
	readings.set(root, { files, signature: signatureOf({ root, files: [...configs, ...files] }) })
	return files
}

/** The setup and global setup files, then every test helper they reach by import. */
function readInfrastructure(params: {
	root: string
	isTestSupport: (file: string) => boolean
}): ReadonlySet<string> {
	const { root } = params
	const resolveModule = createModuleResolver({ root })
	const files = new Set([...resolveModule.setupFiles, ...resolveModule.globalSetupFiles])
	const queue = [...files]
	while (queue.length > 0) {
		const current = queue.shift() ?? ''
		const text = readFileSync(join(root, current), 'utf8')
		for (const specifier of moduleSpecifiers({ text, file: current })) {
			const resolution = resolveModule({ specifier, from: current })
			if (resolution.kind !== 'local') continue
			const file = resolution.file.split(sep).join(posix.sep)
			if (files.has(file) || TEST_FILE_PATTERN.test(file) || !params.isTestSupport(file)) continue
			files.add(file)
			queue.push(file)
		}
	}
	return files
}

/** The vite and vitest config files of the root, sorted. */
function listConfigFiles(params: { root: string }): string[] {
	try {
		return readdirSync(params.root)
			.filter(
				(name) => VITEST_CONFIG_FILE_PATTERN.test(name) || VITE_CONFIG_FILE_PATTERN.test(name),
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
