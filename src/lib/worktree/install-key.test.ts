/** The install key: what npm installed, the same whatever the package's own name and version. */
import { createHash } from 'node:crypto'

import {
	NOT_JSON_LOCK,
	NO_PACKAGES_LOCK,
	PACKAGES,
	PACKAGES_A_NEWER,
	PACKAGES_NOT_AN_OBJECT_LOCK,
	PACKAGES_REORDERED,
	PACKAGES_WITHOUT_B,
	PACKAGES_WITH_C,
	ROOT_FIELDS_A,
	ROOT_FIELDS_B,
} from '../../../test/install-key.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, writeFiles } from '../../../test/scratch-repository.ts'
import { SHA256_HEX } from '../../../test/step-reuse.constants.ts'
import { readInstalledKey } from '../gate-records/check-key.ts'
import { INSTALLED_LOCK_FILE, NO_INSTALLED_LOCK } from '../gate-records/gate-records.constants.ts'
import { computeInstallKey } from './install-key.ts'

import { describe, expect, it } from 'vitest'

/** A repository whose installed lock is `lock` (text), or has none. */
function repositoryWithLock(lock: string | undefined): string {
	const root = createScratchRepository({ '.gitignore': 'node_modules\n' })
	if (lock !== undefined) writeFiles({ root, files: { [INSTALLED_LOCK_FILE]: lock } })
	return root
}

/** An installed lock of the given root fields and packages, as npm writes it. */
function lockOf(params: { root: object; packages: object }): string {
	return `${JSON.stringify({ ...params.root, packages: params.packages }, null, 2)}\n`
}

/** The sha256 of `text`, in hex: the hash the key holds of what it hashed. */
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

describe('computeInstallKey', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it.each(SAME_KEY_CASES)('$label → the same key', ({ first, second }) => {
		const firstRoot = repositoryWithLock(first)
		const secondRoot = repositoryWithLock(second)

		expect(computeInstallKey(secondRoot)).toBe(computeInstallKey(firstRoot))
	})

	it.each(OTHER_KEY_CASES)('$label → another key', ({ first, second }) => {
		const firstRoot = repositoryWithLock(first)
		const secondRoot = repositoryWithLock(second)

		expect(computeInstallKey(secondRoot)).not.toBe(computeInstallKey(firstRoot))
	})

	it('an installed lock → a sha256 (hex)', () => {
		const root = repositoryWithLock(lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }))

		expect(computeInstallKey(root)).toMatch(SHA256_HEX)
	})

	it('no installed lock → none', () => {
		expect(computeInstallKey(repositoryWithLock(undefined))).toBe(NO_INSTALLED_LOCK)
	})

	it.each([
		{ label: 'a file that is no JSON', lock: NOT_JSON_LOCK },
		{ label: 'a JSON with no packages', lock: NO_PACKAGES_LOCK },
		{ label: 'a JSON whose packages is no object', lock: PACKAGES_NOT_AN_OBJECT_LOCK },
	])('$label → the sha256 of its bytes', ({ lock }) => {
		expect(computeInstallKey(repositoryWithLock(lock))).toBe(sha256(lock))
	})
})

describe('readInstalledKey', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('two roots whose installed locks differ only in the root version → the same lockHash, and it is the install key', () => {
		const first = repositoryWithLock(lockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }))
		const second = repositoryWithLock(
			lockOf({ root: { ...ROOT_FIELDS_A, version: '9.9.9' }, packages: PACKAGES }),
		)

		expect(readInstalledKey(second).lockHash).toBe(readInstalledKey(first).lockHash)
		expect(readInstalledKey(first).lockHash).toBe(computeInstallKey(first))
	})
})
