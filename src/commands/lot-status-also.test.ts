/** `lot status`, text form: a ready lot with a registry entry shows the alternative command too. */
import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { withLines } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

// the helper names the registry entry after the lot
const LOT = '0007-repo-feature'

describe(
	'lot status, text form of a ready lot with a pending registry entry',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a line carries the also command (handover run), the next line the show command, at most five lines', () => {
			const workspace = createBriefWorkspace()
			writeStoreLot({ workspace, name: LOT, scope: ['src/'], registry: 'pending' })
			const argv = ['status', LOT]

			expect(withLines(runLot({ cwd: workspace.repository, argv }))).toMatchObject({
				exitCode: 0,
				lines: expect.arrayContaining([
					`next: dialecte handover show ${LOT}`,
					expect.stringContaining(`dialecte handover run ${LOT}`),
				]),
			})
			expect(
				withLines(runLot({ cwd: workspace.repository, argv })).lines.length,
			).toBeLessThanOrEqual(5)
		})
	},
)
