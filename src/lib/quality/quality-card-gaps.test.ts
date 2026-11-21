/** The card's quality row when the public API is unknown: the docs were not judged, so the row never passes. */
import { buildQualityLine } from './quality-card.ts'

import { describe, expect, it } from 'vitest'

import type { QualityStanding } from './quality.types.ts'

const SHORT = 'abc1234'
const LOT_BASE = { commit: `${SHORT}${'0'.repeat(33)}`, source: 'lot' as const }

/** Why the public API diff is unknown when an export source changed while every api.json did not. */
const NOT_REGENERATED =
	'an export source changed while every api.json did not: run dialecte skills generate'

/** A record of this tree with nothing found, its public API unknown. */
const API_UNKNOWN: QualityStanding = {
	lists: { kind: 'current', base: LOT_BASE, duplicates: [], sharedExports: [] },
	docs: { kind: 'current', base: LOT_BASE, docs: [], notJudged: NOT_REGENERATED },
}

describe('buildQualityLine with the public API unknown', () => {
	it('a current record, nothing found, its public API unknown → a warning row: docs not judged, with why', () => {
		expect(buildQualityLine({ standing: API_UNKNOWN, short: SHORT })).toEqual({
			name: 'quality',
			status: 'warning',
			detail: expect.stringContaining(`docs: not judged (${NOT_REGENERATED})`),
		})
	})
})
