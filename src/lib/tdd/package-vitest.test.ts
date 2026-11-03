import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { writeRecordingScript } from '../../../test/recording-script.ts'
import { initializeRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { resolvePackageVitest } from './package-vitest.ts'
import {
	REPOSITORY_MARKER,
	VITEST_BIN_PATH,
	VITEST_COMMAND,
	VITEST_RUN_ARGUMENT,
} from './tdd.constants.ts'

import { describe, expect, it } from 'vitest'

function installBinary(params: { folder: string }): string {
	const path = join(params.folder, ...VITEST_BIN_PATH)
	writeRecordingScript({ path })
	return path
}

/** True when a `.git` sits in the folder or one of its ancestors. */
function hasRepositoryAbove(params: { folder: string }): boolean {
	const parent = dirname(params.folder)
	if (existsSync(join(params.folder, REPOSITORY_MARKER))) return true
	return parent === params.folder ? false : hasRepositoryAbove({ folder: parent })
}

const [fallbackCommand, ...fallbackArguments] = VITEST_COMMAND
const npxFallback = { command: fallbackCommand, arguments: fallbackArguments }

describe('resolvePackageVitest', () => {
	it('a package with node_modules/.bin/vitest → that binary, started with run', () => {
		const root = initializeRepository({ root: temporaryFolder('dialecte-pv-') })
		const binary = installBinary({ folder: root })

		expect(resolvePackageVitest({ root })).toEqual({
			command: binary,
			arguments: [VITEST_RUN_ARGUMENT],
		})
	})

	it('a workspace package without a binary, its repository root with one → the root binary', () => {
		const repository = initializeRepository({ root: temporaryFolder('dialecte-pv-') })
		const packageRoot = join(repository, 'packages', 'demo')
		mkdirSync(packageRoot, { recursive: true })
		const binary = installBinary({ folder: repository })

		expect(resolvePackageVitest({ root: packageRoot })).toEqual({
			command: binary,
			arguments: [VITEST_RUN_ARGUMENT],
		})
	})

	it('a binary in the package and one at the repository root → the package one wins', () => {
		const repository = initializeRepository({ root: temporaryFolder('dialecte-pv-') })
		const packageRoot = join(repository, 'packages', 'demo')
		mkdirSync(packageRoot, { recursive: true })
		installBinary({ folder: repository })
		const own = installBinary({ folder: packageRoot })

		expect(resolvePackageVitest({ root: packageRoot })).toEqual({
			command: own,
			arguments: [VITEST_RUN_ARGUMENT],
		})
	})

	it('no binary on the walk → the npx fallback, unchanged', () => {
		const root = initializeRepository({ root: temporaryFolder('dialecte-pv-') })

		expect(resolvePackageVitest({ root })).toEqual(npxFallback)
	})

	it('a binary above the repository root → not taken, the npx fallback', () => {
		const outside = temporaryFolder('dialecte-pv-')
		installBinary({ folder: outside })
		const root = initializeRepository({ root: join(outside, 'repository') })

		expect(resolvePackageVitest({ root })).toEqual(npxFallback)
	})

	it('the repository .git is a file (a worktree), a binary above it → not taken, the npx fallback', () => {
		const outside = initializeRepository({ root: temporaryFolder('dialecte-pv-') })
		installBinary({ folder: outside })
		const root = join(outside, 'worktree')
		mkdirSync(root)
		writeFileSync(join(root, REPOSITORY_MARKER), 'gitdir: /elsewhere/.git/worktrees/worktree\n')

		expect(resolvePackageVitest({ root })).toEqual(npxFallback)
	})

	it('no repository on the walk, a binary in the package root → that binary', () => {
		const root = temporaryFolder('dialecte-pv-')
		expect(hasRepositoryAbove({ folder: root })).toBe(false)
		const binary = installBinary({ folder: root })

		expect(resolvePackageVitest({ root })).toEqual({
			command: binary,
			arguments: [VITEST_RUN_ARGUMENT],
		})
	})

	it('no repository on the walk, a binary only in a parent folder → not taken, the npx fallback', () => {
		const parent = temporaryFolder('dialecte-pv-')
		expect(hasRepositoryAbove({ folder: parent })).toBe(false)
		installBinary({ folder: parent })
		const root = join(parent, 'package')
		mkdirSync(root)

		expect(resolvePackageVitest({ root })).toEqual(npxFallback)
	})
})
