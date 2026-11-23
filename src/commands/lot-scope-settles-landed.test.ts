/**
 * `lot scope --add` settles a lot the added entry meets that merged on the host but was never closed
 * (FIX-start-settles-landed, design section 2.1): its landed fact is written and the entry is added.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { LANDING_CHANGE_REQUEST_NUMBER, LANDING_NOW } from '../../test/landing-lot.constants.ts'
import { addLandingLot, landingLotOf, writeLandingRecord } from '../../test/landing-lot.ts'
import { landingHostOf, mergeOnOrigin } from '../../test/landing-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lock file the merged lot holds and the other lot adds. */
const LOCK_FILE = 'package-lock.json'

describe(
	'lot scope --add settles a met lot that merged on the host',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("lot scope --add of a lock file a lot squash-merged on origin and fetched holds -> added, the lot's landed fact written", () => {
			const merged = landingLotOf({ scope: [LOCK_FILE] })
			writeLandingRecord({ lot: merged, number: LANDING_CHANGE_REQUEST_NUMBER })
			mergeOnOrigin({ repository: merged.repository, how: 'squash' })
			const other = addLandingLot({ lot: merged, name: '0002-repo-y', branch: 'feat/y' })

			const result = runLot({
				cwd: merged.workspace.repository,
				argv: [
					'scope',
					other.name,
					'--add',
					LOCK_FILE,
					'--by',
					'reviewer',
					'--reason',
					'the lock moves',
				],
				now: LANDING_NOW,
				host: landingHostOf({}).host,
			})

			expect({
				exitCode: result.exitCode,
				settled: new RegExp(
					`^settled ${merged.name}: merged on main at ${merged.tip.slice(0, SHORT_SHA_LENGTH)} \\(`,
					'm',
				).test(result.output),
				added: result.output.includes(`lot scope: ${other.name} added ${LOCK_FILE} by reviewer`),
				landed: existsSync(join(merged.lotFolder, 'landed.json')),
			}).toEqual({ exitCode: 0, settled: true, added: true, landed: true })
		})
	},
)
