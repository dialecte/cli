import { scopeIndex } from '../../../../test/ask-ladder-fixtures.ts'
import { SYNTHETIC_FILE_ID } from '../../../../test/synthetic-standard.constants.ts'
import { slicesOf } from './slices-of.ts'

import { describe, expect, it } from 'vitest'

import type { AskAngle } from './ask.types.ts'

/** A question none of the synthetic lines holds a word of: find for the whole question lists nothing. */
const UNMATCHED_QUESTION = 'zzz'
const SUBJECT_ANGLE: AskAngle = { id: 'a1', family: 'subject', terms: ['AA_1'] }
const QUESTION_ANGLE: AskAngle = { id: 'a2', family: 'question', terms: ['closing'] }

describe('slicesOf: one find per angle over the standard, then the merge (D12, case 11)', () => {
	it('an angle naming AA_1 -> the slice holding the lines that name it, first, with its angle', () => {
		expect(
			slicesOf({
				question: UNMATCHED_QUESTION,
				angles: [SUBJECT_ANGLE],
				indexes: [scopeIndex()],
				about: 'AA_1',
				limit: 10,
			}),
		).toEqual([
			{
				id: 's1',
				file: SYNTHETIC_FILE_ID,
				from: 3,
				to: 3,
				clause: '1',
				angles: ['a1'],
				score: 1.18,
				linked: false,
			},
		])
	})

	it('two angles -> the subject lines first, found by both angles (about names AA_1), the closing clause next', () => {
		expect(
			slicesOf({
				question: UNMATCHED_QUESTION,
				angles: [SUBJECT_ANGLE, QUESTION_ANGLE],
				indexes: [scopeIndex()],
				about: 'AA_1',
				limit: 10,
			}),
		).toEqual([
			expect.objectContaining({ id: 's1', from: 3, to: 3, angles: ['a1', 'a2'] }),
			expect.objectContaining({ id: 's2', from: 7, to: 7, clause: '2', angles: ['a2'] }),
		])
	})

	it('no angle -> no slice', () => {
		expect(
			slicesOf({
				question: UNMATCHED_QUESTION,
				angles: [],
				indexes: [scopeIndex()],
				about: 'AA_1',
				limit: 10,
			}),
		).toEqual([])
	})
})

describe('slicesOf: find for the whole question comes first, the angle adds what it does not cover (D27)', () => {
	it('the question names the closing clause, the angle names AA_1 -> the closing clause first (find), the AA_1 lines after it with their angle', () => {
		expect(
			slicesOf({
				question: 'closing',
				angles: [SUBJECT_ANGLE],
				indexes: [scopeIndex()],
				limit: 10,
			}),
		).toMatchObject([
			{ id: 's1', clause: '2' },
			{ id: 's2', from: 3, to: 3, clause: '1', angles: ['a1'] },
		])
	})

	it('the angle finds only the clause the question finds -> nothing is added: find alone', () => {
		expect(
			slicesOf({
				question: 'closing',
				angles: [QUESTION_ANGLE],
				indexes: [scopeIndex()],
				limit: 10,
			}).map((slice) => slice.clause),
		).toEqual(['2'])
	})
})
