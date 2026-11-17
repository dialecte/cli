import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { createVitestPackage } from '../../../test/scratch-vitest-package.ts'
import {
	BASE_RED_SCENARIO_TIMEOUT,
	VITEST_CONFIG_FILE,
	VITEST_CONFIG_TEXT,
	VITEST_REVISED_TEST_TEXT,
} from '../../../test/tdd-runners-base-red-workspace.constants.ts'
import {
	ADD_FILE,
	ADD_SUBTRACTING_TEXT,
	ADD_TEST_FILE,
} from '../../../test/tdd-runners-node-workspace.constants.ts'
import { readPackageJson } from '../package-json.ts'
import { runCaseOnBase, selectBaseOverlay } from './base-red.ts'
import { changedTestCodeOf } from './test-code-presence.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'
import type { BaseOverlay } from './base-red.types.ts'

describe('selectBaseOverlay', () => {
	const CASES: Record<
		string,
		{
			changed: string[]
			deleted: string[]
			packageJson?: PackageJson
			overlay: BaseOverlay
		}
	> = {
		'a changed test file → laid over the base at its current bytes': {
			changed: ['src/add.test.ts'],
			deleted: [],
			overlay: { write: ['src/add.test.ts'], remove: [] },
		},
		'a changed production file → left as the base has it': {
			changed: ['src/add.ts'],
			deleted: [],
			overlay: { write: [], remove: [] },
		},
		'a changed helper in a test folder → laid over': {
			changed: ['test/expected.ts'],
			deleted: [],
			overlay: { write: ['test/expected.ts'], remove: [] },
		},
		'a changed fixture and a changed snapshot → both laid over': {
			changed: ['src/fixtures/values.ts', 'src/__snapshots__/add.test.ts.snap'],
			deleted: [],
			overlay: {
				write: ['src/fixtures/values.ts', 'src/__snapshots__/add.test.ts.snap'],
				remove: [],
			},
		},
		'a changed conftest and a changed pytest file → both laid over': {
			changed: ['tests/conftest.py', 'tests/test_add.py'],
			deleted: [],
			overlay: { write: ['tests/conftest.py', 'tests/test_add.py'], remove: [] },
		},
		'production and test code changed together → only the test code laid over': {
			changed: ['src/add.ts', 'src/add.test.ts', 'README.md'],
			deleted: [],
			overlay: { write: ['src/add.test.ts'], remove: [] },
		},
		'a deleted test file → removed from the base copy': {
			changed: [],
			deleted: ['src/old.test.ts'],
			overlay: { write: [], remove: ['src/old.test.ts'] },
		},
		'a deleted helper and a deleted fixture → both removed from the base copy': {
			changed: [],
			deleted: ['test/expected.ts', 'src/fixtures/values.ts'],
			overlay: { write: [], remove: ['test/expected.ts', 'src/fixtures/values.ts'] },
		},
		'a new test file the lot adds → laid over, the base has none to replace': {
			changed: ['src/new.test.ts'],
			deleted: [],
			overlay: { write: ['src/new.test.ts'], remove: [] },
		},
		'a deleted production file → kept in the base copy, the base is its truth': {
			changed: [],
			deleted: ['src/old.ts'],
			overlay: { write: [], remove: [] },
		},
		'a helper under a folder the package declares production → left as the base has it': {
			changed: ['src/test/engine.ts', 'src/test/engine.test.ts'],
			deleted: [],
			packageJson: { dialecte: { tdd: { production: ['src/test'] } } },
			overlay: { write: ['src/test/engine.test.ts'], remove: [] },
		},
		'the lot file → never laid over': {
			changed: ['.dialecte/lot.json'],
			deleted: [],
			overlay: { write: [], remove: [] },
		},
	}

	for (const [title, testCase] of Object.entries(CASES))
		it(title, () => {
			expect(
				selectBaseOverlay({
					root: temporaryFolder('dialecte-base-overlay-'),
					packageJson: testCase.packageJson ?? {},
					changed: testCase.changed,
					deleted: testCase.deleted,
				}),
			).toEqual(testCase.overlay)
		})
})

describe('runCaseOnBase', { timeout: BASE_RED_SCENARIO_TIMEOUT }, () => {
	it("a vitest base run of a package with a TypeScript vitest config → Vite's caches written in the throwaway, the lot's node_modules as it was", async () => {
		const root = createVitestPackage({
			files: {
				[VITEST_CONFIG_FILE]: VITEST_CONFIG_TEXT,
				[ADD_FILE]: ADD_SUBTRACTING_TEXT,
				[ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT,
			},
		})
		const before = readdirSync(join(root, 'node_modules')).sort()

		const verdict = await runCaseOnBase({
			root,
			base: 'HEAD',
			presence: changedTestCodeOf({ root, base: 'HEAD' }),
			packageJson: readPackageJson(root),
			testCase: {
				file: ADD_TEST_FILE,
				name: 'add > one',
				project: '',
				body: '',
				state: 'passed',
				caseHash: '',
				ofChange: true,
				ofBase: false,
			},
		})

		expect(verdict).toMatchObject({ kind: 'red' })
		expect(readdirSync(join(root, 'node_modules')).sort()).toEqual(before)
	})
})
