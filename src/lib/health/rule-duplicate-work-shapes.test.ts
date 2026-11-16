/** Rule 1a: a record of the older shape is compared only with records of the older shape. */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { GREEN_AT, STEP_HASH_ONE, WINDOW } from '../../../test/health.constants.ts'
import {
	commonOfStoreCase,
	copyHealthFixture,
	newShapeSteps,
	recordOf,
	rerunHook,
} from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'

import { describe, expect, it } from 'vitest'

const PAIR_FIXTURE = 'health-hook-pair'
const PAIR_STORE_FILE = 'dac17af017acd8694d9674638816701f8326b947.json'
const PAIR_WINDOW = { since: WINDOW.since, now: new Date('2026-11-16T00:00:00.000Z') }

describe('findDuplicateWork, old shape against new shape', () => {
	it('the real pair of a rehearsal clone (hook-gate record, then the hook wrapper record one second later, no run event) → no finding', () => {
		const repository = readHealthRepository({ common: copyHealthFixture({ name: PAIR_FIXTURE }) })

		expect(findDuplicateWork({ repository, window: PAIR_WINDOW })).toEqual([])
	})

	it('the copied hook-pair fixture → holds its one store file', () => {
		const common = copyHealthFixture({ name: PAIR_FIXTURE })

		expect(readdirSync(join(common, 'dialecte-checks'))).toEqual([PAIR_STORE_FILE])
	})

	it('a new-shape green hook-gate record, then an old-shape hook record of the same key, no run → no finding', () => {
		const common = commonOfStoreCase({
			name: 'new green, old re-run',
			expected: [],
			records: [
				recordOf({ mode: 'hook-gate', at: GREEN_AT, steps: newShapeSteps(STEP_HASH_ONE) }),
				rerunHook(),
			],
		})

		expect(
			findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }),
		).toEqual([])
	})
})
