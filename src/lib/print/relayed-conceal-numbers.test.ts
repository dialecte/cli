/** R1-A3: the conceal parameter is compared as a number: `08` and `008` hide text too, so they are dropped. */
import { CONCEAL_NUMBER_SAMPLES } from '../../../test/relayed-conceal-numbers.constants.ts'
import { relayedTextOf } from './relayed.ts'

import { describe, expect, it } from 'vitest'

describe('relayedTextOf conceal written as a number', () => {
	for (const sample of CONCEAL_NUMBER_SAMPLES)
		it(`a line holding ${sample.title} -> printed as the literal expects`, () => {
			expect(relayedTextOf([sample.line])).toBe(sample.printed)
		})
})
