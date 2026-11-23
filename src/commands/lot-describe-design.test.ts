/**
 * `lot describe` builds the design line from the lot's live design standing (DESIGN-GATE section 4, review round 1): a source
 * edited after its approval reads stale in the body, whatever `review.jsonl` last recorded.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { DESIGN_TEXT, EDITED_DESIGN_TEXT, APPROVER } from '../../test/design-workspace.constants.ts'
import { isolateTemporaryFolders } from '../../test/design-workspace.ts'
import { recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-describe.constants.ts'
import { changeRequestLot } from '../../test/lot-describe.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotDescribe } from './lot-describe.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot pr - the design line', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('approved, then the source edited -> the body says the design is stale since its approval', () => {
		const lot = changeRequestLot()
		const cwd = lot.workspace.repository
		const file = join(cwd, 'DESIGN.md')
		writeFileSync(file, DESIGN_TEXT)
		// the design was written before: under neither the isolated temporary folder nor the scratch root
		isolateTemporaryFolders()
		runLot({ cwd, argv: ['design', LOT_NAME, '--from', file], sharedTemporaryRoots: [] })
		runLot({ cwd, argv: ['design', LOT_NAME, '--approve', '--by', APPROVER] })
		writeFileSync(file, EDITED_DESIGN_TEXT)

		expect(
			runLotDescribe({ cwd, argv: [LOT_NAME, '--print'], host: recordingHost().host }).output,
		).toContain('Design: stale since its approval by person')
	})
})
