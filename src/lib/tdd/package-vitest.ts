import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
	REPOSITORY_MARKER,
	VITEST_BIN_PATH,
	VITEST_COMMAND,
	VITEST_PACKAGE_PATH,
	VITEST_RUN_ARGUMENT,
} from './tdd.constants.ts'

import type { PackageVitest } from './tdd.types.ts'

/**
 * The package's own vitest: `node_modules/.bin/vitest` from the package root up to the repository root (the
 * first found wins), else the npx fallback. Never the cli's own copy. The walk stops at, and includes, the
 * nearest folder holding a `.git` entry; with no repository on the way only the package root counts.
 */
export function resolvePackageVitest(params: { root: string }): PackageVitest {
	const binary = findBinary({ root: params.root })
	if (binary) return { command: binary, arguments: [VITEST_RUN_ARGUMENT] }
	const [command, ...commandArguments] = VITEST_COMMAND
	return { command, arguments: commandArguments }
}

/**
 * The folder of the `vitest` package of the installation whose `node_modules/.bin/vitest` a run uses: the
 * `node_modules/vitest` beside it; undefined with no binary found (the npx fallback) or no package beside it.
 */
export function packageVitestFolder(params: { root: string }): string | undefined {
	const binary = findBinary(params)
	if (!binary) return undefined
	// <folder>/node_modules/.bin/vitest -> <folder>/node_modules/vitest
	const folder = join(dirname(dirname(dirname(binary))), ...VITEST_PACKAGE_PATH)
	return existsSync(folder) ? folder : undefined
}

function findBinary(params: { root: string }): string | undefined {
	const folders = walkedFolders({ root: params.root })
	return folders.map((folder) => join(folder, ...VITEST_BIN_PATH)).find((path) => existsSync(path))
}

/** The folders from the package root up to the nearest repository root, or the package root alone. */
export function walkedFolders(params: { root: string }): string[] {
	const folders: string[] = []
	let folder = params.root
	for (;;) {
		folders.push(folder)
		if (existsSync(join(folder, REPOSITORY_MARKER))) return folders
		const parent = dirname(folder)
		if (parent === folder) return [params.root]
		folder = parent
	}
}
