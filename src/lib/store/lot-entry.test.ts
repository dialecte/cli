/** The line `plan next` prints for a landed lot. */
import { LANDED_LOT } from '../../../test/landed-store-lot-workspace.constants.ts'
import { landedLineFrom } from './lot-entry.ts'

import { describe, expect, it } from 'vitest'

describe('landedLineFrom: why the lot reads committed', () => {
	it('a lot, the folder of its hand-over and the target branch → the line naming all three', () => {
		expect(landedLineFrom({ name: LANDED_LOT, folder: '/handovers/one', target: 'main' })).toBe(
			`lot ${LANDED_LOT} committed: hand-over committed in /handovers/one, branch on main`,
		)
	})
})
