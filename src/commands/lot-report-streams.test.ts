/**
 * The stream each exit of `lot report` and `lot station` prints on (33L0 section 12, `HOST_VERB_ERROR_EXITS`): a usage
 * error or a refusal (2) on standard error; `report`'s exit 1 (a feature with no lot) is an error too, on standard
 * error (round 1, R1-11); `station`'s exits 1 (the event could not be written) and 2 are errors.
 */
import { printsOnStandardError } from './lot-streams.ts'

import { describe, expect, it } from 'vitest'

const EXITS = [0, 1, 2]

describe('printsOnStandardError: report and station', () => {
	it('exits 0, 1, 2 → report: 1 and 2 on standard error; station: 1 and 2 on standard error', () => {
		expect({
			report: EXITS.map((exitCode) => printsOnStandardError({ verb: 'report', exitCode })),
			station: EXITS.map((exitCode) => printsOnStandardError({ verb: 'station', exitCode })),
		}).toEqual({ report: [false, true, true], station: [false, true, true] })
	})
})
