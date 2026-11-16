/** The lock key: what a tree's package-lock.json installs, the same whatever the package's own name and version. */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	NOT_JSON_LOCK,
	NO_PACKAGES_LOCK,
	PACKAGES,
	PACKAGES_A_NEWER,
	PACKAGES_NOT_AN_OBJECT_LOCK,
	PACKAGES_REORDERED,
	PACKAGES_WITHOUT_B,
	PACKAGES_WITH_C,
	ROOT_ENTRY_A,
	ROOT_ENTRY_B,
	ROOT_FIELDS_A,
	ROOT_FIELDS_B,
} from '../../../test/lock-key.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { NO_LOCK_KEY } from '../gate-records/gate-records.constants.ts'
import { computeLockKey, computeTreeLockKey } from './lock-key.ts'
import { PACKAGE_LOCK_FILE } from './worktree.constants.ts'

import { describe, expect, it } from 'vitest'

const SHA256_HEX = /^[0-9a-f]{64}$/

/** A lock of the given root fields and packages, as npm writes it. */
function lockOf(params: { root: object; packages: object }): string {
	return `${JSON.stringify({ ...params.root, packages: params.packages }, null, 2)}\n`
}

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

type KeyCase = { label: string; first: string; second: string }

const SAME_KEY_CASES: KeyCase[] = [
	{
		label: 'same packages, another root version',
		first: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }),
		second: lockOf({ root: { ...ROOT_FIELDS_A, version: '9.9.9' }, packages: PACKAGES }),
	},
	{
		label: 'same packages, another root name',
		first: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }),
		second: lockOf({ root: ROOT_FIELDS_B, packages: PACKAGES }),
	},
	{
		label: 'same packages, another key order',
		first: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }),
		second: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES_REORDERED }),
	},
	{
		label: 'same packages, the package entry at another name, version and range',
		first: lockOf({ root: ROOT_FIELDS_A, packages: { ...ROOT_ENTRY_A, ...PACKAGES } }),
		second: lockOf({ root: ROOT_FIELDS_A, packages: { ...ROOT_ENTRY_B, ...PACKAGES } }),
	},
	{
		label: 'same packages, written compact',
		first: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }),
		second: JSON.stringify({ packages: PACKAGES, ...ROOT_FIELDS_B }),
	},
]

const OTHER_KEY_CASES: KeyCase[] = [
	{
		label: 'a package added',
		first: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }),
		second: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES_WITH_C }),
	},
	{
		label: 'a package removed',
		first: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }),
		second: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES_WITHOUT_B }),
	},
	{
		label: 'a dependency of a package changed',
		first: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }),
		second: lockOf({
			root: ROOT_FIELDS_A,
			packages: {
				...PACKAGES,
				'node_modules/b': {
					...PACKAGES['node_modules/b'],
					dependencies: { x: '^1.1.0', y: '^2.0.0' },
				},
			},
		}),
	},
	{
		label: 'a package at another version',
		first: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }),
		second: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES_A_NEWER }),
	},
]

/** The tree of a repository whose package-lock.json is `lock`, or that holds none. */
function treeWithLock(lock: string | undefined): { root: string; tree: string } {
	const root = createScratchRepository(lock === undefined ? {} : { [PACKAGE_LOCK_FILE]: lock })
	return { root, tree: git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim() }
}

describe('computeLockKey', () => {
	it.each(SAME_KEY_CASES)('$label → the same key', ({ first, second }) => {
		expect(computeLockKey({ text: second })).toBe(computeLockKey({ text: first }))
	})

	it.each(OTHER_KEY_CASES)('$label → another key', ({ first, second }) => {
		expect(computeLockKey({ text: second })).not.toBe(computeLockKey({ text: first }))
	})

	it('a lock → a sha256 (hex)', () => {
		expect(computeLockKey({ text: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }) })).toMatch(
			SHA256_HEX,
		)
	})

	it('no lock → none', () => {
		expect(computeLockKey({ text: undefined })).toBe(NO_LOCK_KEY)
	})

	it.each([
		{ label: 'a file that is no JSON', lock: NOT_JSON_LOCK },
		{ label: 'a JSON with no packages', lock: NO_PACKAGES_LOCK },
		{ label: 'a JSON whose packages is no object', lock: PACKAGES_NOT_AN_OBJECT_LOCK },
	])('$label → the sha256 of its bytes', ({ lock }) => {
		expect(computeLockKey({ text: lock })).toBe(sha256(lock))
	})
})

describe('computeTreeLockKey', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a tree holding a lock → the key of that lock', () => {
		const lock = lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES })
		const { root, tree } = treeWithLock(lock)

		expect(computeTreeLockKey({ root, tree })).toBe(computeLockKey({ text: lock }))
	})

	it('a tree holding no lock → none', () => {
		const { root, tree } = treeWithLock(undefined)

		expect(computeTreeLockKey({ root, tree })).toBe(NO_LOCK_KEY)
	})

	it('the lock on disk and the installed one changed after the commit → still the key of the tree', () => {
		const lock = lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES })
		const { root, tree } = treeWithLock(lock)
		writeFiles({
			root,
			files: {
				[PACKAGE_LOCK_FILE]: lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES_A_NEWER }),
				'node_modules/.package-lock.json': lockOf({
					root: ROOT_FIELDS_A,
					packages: PACKAGES_WITH_C,
				}),
			},
		})

		expect(computeTreeLockKey({ root, tree })).toBe(computeLockKey({ text: lock }))
	})

	it('a package in a folder of the repository → the lock of that folder in the tree', () => {
		const lock = lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES })
		const root = createScratchRepository({
			[PACKAGE_LOCK_FILE]: lockOf({ root: ROOT_FIELDS_B, packages: PACKAGES_WITH_C }),
			[`app/${PACKAGE_LOCK_FILE}`]: lock,
		})
		const tree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()

		expect(computeTreeLockKey({ root: `${root}/app`, tree })).toBe(computeLockKey({ text: lock }))
	})
})

describe('the lock key is read from the tree only', () => {
	it("no source file of the cli reads npm's installed lock (node_modules/.package-lock.json): every check key reads the checked tree's lock", () => {
		const source = join(import.meta.dirname, '..', '..')
		const readers = readdirSync(source, { recursive: true, encoding: 'utf8' })
			.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
			.filter((file) => readFileSync(join(source, file), 'utf8').includes('.package-lock.json'))

		expect(readers).toEqual([])
	})
})
