import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
	FIXTURE_0105,
	REAL_PLAN_LOT,
	REAL_STORE_FILES,
	WINDOW,
} from '../../../test/health.constants.ts'
import { copyHealthFixture } from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'

import { describe, expect, it } from 'vitest'

describe('findDuplicateWork, real records of a rehearsed lot', () => {
	it('the real store files, events and rehearsal plan → two red findings: the rehearsal re-run, then the hook re-run', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })

		expect(
			findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }),
		).toEqual([
			{
				rule: 'duplicate-work',
				severity: 'red',
				repository: 'cli',
				lot: '0105-cli-lot-scope',
				at: '2026-11-15T03:38:50.904Z',
				text: `tree c7fef5d3019b: the rehearsal re-ran lot ${REAL_PLAN_LOT} for 30 m 24 s although a green hook record existed (2026-11-15T03:33:49.995Z, rehearsal)`,
				detail: [
					`rehearsal.json: lot ${REAL_PLAN_LOT} rehearsed - fix/lot-scope moved: the merge leaves tree c7fef5d3019b, the tip holds 022cf91611cc`,
					're-run key: not recorded',
				],
			},
			{
				rule: 'duplicate-work',
				severity: 'red',
				repository: 'cli',
				lot: '0105-cli-lot-scope',
				at: '2026-11-15T04:26:50.772Z',
				text: 'tree c7fef5d3019b: hook ran 15 m 42 s although a green hook record existed (2026-11-15T03:33:49.995Z, rehearsal)',
				detail: [
					'green  hook 2026-11-15T03:33:49.995Z rehearsal  install 35a2853dde35  command 30349d5bdbc8  linked e3b0c44298fc',
					're-run hook 2026-11-15T04:26:50.772Z  install 7e6312612691  command 30349d5bdbc8  linked e3b0c44298fc',
					'differed: install',
				],
			},
		])
	})

	it('the copied fixture → holds the store files of both trees', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })

		expect(readdirSync(join(common, 'dialecte-checks')).sort()).toEqual(REAL_STORE_FILES)
	})
})
