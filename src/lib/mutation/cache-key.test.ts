import { join } from 'node:path'

import { SHA256_HEX } from '../../../test/mutation-incremental.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { addWorktree } from '../../../test/scratch-tree.ts'
import { computeIncrementalKey, packageHashOf } from './cache-key.ts'
import { buildStrykerOptions } from './stryker-options.ts'

import { describe, expect, it } from 'vitest'

import type { MutationDeclaration, StrykerOptions } from './mutation.types.ts'

const DECLARATION: MutationDeclaration = {
	scope: ['src/engine/*.ts'],
	exclude: [],
	errorFactories: ['createSclError'],
	fast: { vitestConfig: 'v.config.ts' },
}
const TREE = 'a'.repeat(40)
const PACKAGE_HASH = /^[0-9a-f]{16}$/

/**
 * A package at `prefix` of a scratch repository (the repository's top when empty), with an installed lock and an
 * ignorer file apart; `linked` adds a `file:` dependency (a sibling folder of the package, in the repository).
 */
function keyPackage(params: { prefix?: string; linked?: boolean } = {}): {
	repository: string
	root: string
	ignorer: string
} {
	const { prefix = '', linked = false } = params
	function at(path: string): string {
		return prefix === '' ? path : `${prefix}/${path}`
	}
	const repository = createScratchRepository({
		[at('package.json')]:
			`${JSON.stringify({ name: 'k', ...(linked ? { dependencies: { dep: 'file:../dep' } } : {}) })}\n`,
		...(linked
			? {
					'dep/package.json': `${JSON.stringify({ name: 'dep', files: ['index.js'] })}\n`,
					'dep/index.js': 'module.exports = 1\n',
				}
			: {}),
	})
	writeFiles({ root: repository, files: { [at('node_modules/.package-lock.json')]: 'lock-1\n' } })
	const ignorerFolder = temporaryFolder('dialecte-cache-key-ignorer-')
	writeFiles({ root: ignorerFolder, files: { 'ignorers.js': 'export const ignorers = 1\n' } })
	return { repository, root: join(repository, prefix), ignorer: join(ignorerFolder, 'ignorers.js') }
}

type KeyParams = {
	root: string
	ignorer: string
	tree?: string
	/** Applied to the fast tier's options built from the declaration. */
	withOptions?: (options: StrykerOptions) => StrykerOptions
	cliVersion?: string
	ignorerPlugin?: string
}

/** The arguments of `computeIncrementalKey` for a package: the fast tier's options are built from a declaration. */
function inputsOf(params: KeyParams): Parameters<typeof computeIncrementalKey>[0] {
	const { root, ignorer, tree = TREE, withOptions = (each) => each } = params
	const ignorerPlugin = params.ignorerPlugin ?? ignorer
	const options = withOptions(
		buildStrykerOptions({
			declaration: DECLARATION,
			tier: 'fast',
			mutate: ['src/engine/a.ts:1-3'],
			workDir: '.tmp/mutants/run-1',
			ignorerPlugin,
			configFile: '.tmp/mutants/run-1/stryker.config.json',
		}),
	)
	return { root, tree, options, cliVersion: params.cliVersion ?? '1.0.0', ignorerPlugin }
}

/** Keeps a value for a later comparison: the call that made it sits inside an `expect`, so a throw there is a red. */
function recorded(params: { list: string[]; value: string }): string[] {
	params.list.push(params.value)
	return params.list
}

/** The same value with its object keys in the reverse order, at every depth. */
function reversedKeys<Value>(value: Value): Value {
	if (Array.isArray(value)) return value.map(reversedKeys) as Value
	if (typeof value !== 'object' || value === null) return value
	return Object.fromEntries(
		Object.entries(value)
			.reverse()
			.map(([key, each]) => [key, reversedKeys(each)]),
	) as Value
}

describe('computeIncrementalKey', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the same inputs twice → the same key, 64 hex characters', () => {
		const { root, ignorer } = keyPackage()

		expect(computeIncrementalKey(inputsOf({ root, ignorer }))).toMatch(SHA256_HEX)
		expect(computeIncrementalKey(inputsOf({ root, ignorer }))).toBe(
			computeIncrementalKey(inputsOf({ root, ignorer })),
		)
	})

	it('the order of keys in the options → the same key', () => {
		const { root, ignorer } = keyPackage()

		expect(computeIncrementalKey(inputsOf({ root, ignorer, withOptions: reversedKeys }))).toBe(
			computeIncrementalKey(inputsOf({ root, ignorer })),
		)
	})

	it('the tree changed alone → a different key', () => {
		const { root, ignorer } = keyPackage()

		expect(computeIncrementalKey(inputsOf({ root, ignorer, tree: 'b'.repeat(40) }))).not.toBe(
			computeIncrementalKey(inputsOf({ root, ignorer })),
		)
	})

	it('the package path changed alone (the same bytes, the package one folder deeper in its repository) → a different key', () => {
		const top = keyPackage()
		const deeper = keyPackage({ prefix: 'packages/pkg' })

		expect(computeIncrementalKey(inputsOf({ root: deeper.root, ignorer: top.ignorer }))).not.toBe(
			computeIncrementalKey(inputsOf({ root: top.root, ignorer: top.ignorer })),
		)
	})

	it('the installed lock changed alone → a different key', () => {
		const { root, ignorer } = keyPackage()
		const before: string[] = []
		expect(
			recorded({ list: before, value: computeIncrementalKey(inputsOf({ root, ignorer })) }),
		).toHaveLength(1)

		writeFiles({ root, files: { 'node_modules/.package-lock.json': 'lock-2, longer\n' } })

		expect(computeIncrementalKey(inputsOf({ root, ignorer }))).not.toBe(before[0])
	})

	it('a file: dependency, a file it publishes changed alone → a different key', () => {
		const { repository, root, ignorer } = keyPackage({ prefix: 'pkg', linked: true })
		const before: string[] = []
		expect(
			recorded({ list: before, value: computeIncrementalKey(inputsOf({ root, ignorer })) }),
		).toHaveLength(1)

		writeFiles({ root: repository, files: { 'dep/index.js': 'module.exports = 2222\n' } })

		expect(computeIncrementalKey(inputsOf({ root, ignorer }))).not.toBe(before[0])
	})

	it('the ignorer file changed alone → a different key', () => {
		const { root, ignorer } = keyPackage()
		const before: string[] = []
		expect(
			recorded({ list: before, value: computeIncrementalKey(inputsOf({ root, ignorer })) }),
		).toHaveLength(1)

		writeFiles({
			root: join(ignorer, '..'),
			files: { 'ignorers.js': 'export const ignorers = 2\n' },
		})

		expect(computeIncrementalKey(inputsOf({ root, ignorer }))).not.toBe(before[0])
	})

	it.each([
		['timeoutMS', (options: StrykerOptions) => ({ ...options, timeoutMS: options.timeoutMS + 1 })],
		['coverageAnalysis', (options: StrykerOptions) => ({ ...options, coverageAnalysis: 'off' })],
	])(
		'a fast option that is not per run (%s) changed alone → a different key',
		(_name, withOptions) => {
			const { root, ignorer } = keyPackage()

			expect(computeIncrementalKey(inputsOf({ root, ignorer, withOptions }))).not.toBe(
				computeIncrementalKey(inputsOf({ root, ignorer })),
			)
		},
	)

	it('the cli version changed alone → a different key', () => {
		const { root, ignorer } = keyPackage()

		expect(computeIncrementalKey(inputsOf({ root, ignorer, cliVersion: '1.0.1' }))).not.toBe(
			computeIncrementalKey(inputsOf({ root, ignorer })),
		)
	})

	it.each([
		['mutate', (options: StrykerOptions) => ({ ...options, mutate: ['src/engine/b.ts'] })],
		[
			'jsonReporter.fileName',
			(options: StrykerOptions) => ({ ...options, jsonReporter: { fileName: 'elsewhere.json' } }),
		],
		['tempDirName', (options: StrykerOptions) => ({ ...options, tempDirName: 'elsewhere-tmp' })],
		['configFile', (options: StrykerOptions) => ({ ...options, configFile: 'elsewhere.json' })],
		[
			'incrementalFile',
			(options: StrykerOptions) => ({ ...options, incrementalFile: '/elsewhere/incremental.json' }),
		],
	])('the per-run field %s changed alone → the same key', (_name, withOptions) => {
		const { root, ignorer } = keyPackage()

		expect(computeIncrementalKey(inputsOf({ root, ignorer, withOptions }))).toBe(
			computeIncrementalKey(inputsOf({ root, ignorer })),
		)
	})

	it("the ignorer's path in plugins changed, its bytes the same → the same key", () => {
		const { root, ignorer } = keyPackage()
		const copyFolder = temporaryFolder('dialecte-cache-key-ignorer-')
		writeFiles({ root: copyFolder, files: { 'ignorers.js': 'export const ignorers = 1\n' } })

		expect(
			computeIncrementalKey(
				inputsOf({ root, ignorer, ignorerPlugin: join(copyFolder, 'ignorers.js') }),
			),
		).toBe(computeIncrementalKey(inputsOf({ root, ignorer })))
	})

	it('a missing ignorer file → a key without a throw, different from the one with the file', () => {
		const { root, ignorer } = keyPackage()
		const missing = join(root, '..', 'no-such-ignorers.js')

		expect(computeIncrementalKey(inputsOf({ root, ignorer, ignorerPlugin: missing }))).toMatch(
			SHA256_HEX,
		)
		expect(computeIncrementalKey(inputsOf({ root, ignorer, ignorerPlugin: missing }))).not.toBe(
			computeIncrementalKey(inputsOf({ root, ignorer })),
		)
	})
})

describe('computeIncrementalKey across worktrees', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the same tree, lock, options, cli version and ignorer bytes from another worktree of the repository → the same key', () => {
		const { repository, root, ignorer } = keyPackage({ prefix: 'packages/pkg' })
		const second = addWorktree(repository)
		const secondRoot = join(second, 'packages/pkg')
		writeFiles({ root: secondRoot, files: { 'node_modules/.package-lock.json': 'lock-1\n' } })

		expect(computeIncrementalKey(inputsOf({ root: secondRoot, ignorer }))).toBe(
			computeIncrementalKey(inputsOf({ root, ignorer })),
		)
	})
})

describe('packageHashOf', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('→ 16 hex characters', () => {
		const { root } = keyPackage({ prefix: 'packages/pkg' })

		expect(packageHashOf({ root })).toMatch(PACKAGE_HASH)
	})

	it('two packages of one repository → different hashes; a package at the top → another hash again', () => {
		const repository = createScratchRepository({
			'packages/a/package.json': '{"name":"a"}\n',
			'packages/b/package.json': '{"name":"b"}\n',
		})

		expect(packageHashOf({ root: join(repository, 'packages/a') })).not.toBe(
			packageHashOf({ root: join(repository, 'packages/b') }),
		)
		expect(packageHashOf({ root: repository })).not.toBe(
			packageHashOf({ root: join(repository, 'packages/a') }),
		)
	})

	it('the same package path from another worktree of the repository → the same hash', () => {
		const { repository, root } = keyPackage({ prefix: 'packages/pkg' })
		const second = addWorktree(repository)

		expect(packageHashOf({ root: join(second, 'packages/pkg') })).toBe(packageHashOf({ root }))
	})
})
