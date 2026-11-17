/**
 * `lot pr` builds the design line from the lot's live design standing (DESIGN-GATE section 4, review round 1): a source
 * edited after its approval reads stale in the body, whatever `review.jsonl` last recorded.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { DESIGN_TEXT, EDITED_DESIGN_TEXT, APPROVER } from '../../test/design-workspace.constants.ts'
import { recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-pr.constants.ts'
import { pullRequestLot } from '../../test/lot-pr.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotPr } from './lot-pr.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot pr - the design line', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('approved, then the source edited -> the body says the design is stale since its approval', () => {
		const lot = pullRequestLot()
		const cwd = lot.workspace.repository
		const file = join(cwd, 'DESIGN.md')
		writeFileSync(file, DESIGN_TEXT)
		runLot({ cwd, argv: ['design', LOT_NAME, '--from', file] })
		runLot({ cwd, argv: ['design', LOT_NAME, '--approve', '--by', APPROVER] })
		writeFileSync(file, EDITED_DESIGN_TEXT)

		expect(
			runLotPr({ cwd, argv: [LOT_NAME, '--print'], host: recordingHost().host }).output,
		).toContain('Design: stale since its approval by person')
	})
})
