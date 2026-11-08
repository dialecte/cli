import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { answerOf, writeRecordFile } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readAnswers } from './answers.ts'

import { describe, expect, it } from 'vitest'

function lotFolderWithAnswers(names: Record<string, number>): string {
	const folder = temporaryFolder('dialecte-answers-')
	for (const [name, question] of Object.entries(names)) {
		writeRecordFile({
			folder,
			name: `answers/${name}`,
			text: JSON.stringify(answerOf(question)),
		})
	}
	return folder
}

describe('readAnswers', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('q10.json, q2.json and q1.json → in question order 1, 2, 10', () => {
		const lotFolder = lotFolderWithAnswers({ 'q10.json': 10, 'q2.json': 2, 'q1.json': 1 })

		expect(readAnswers({ lotFolder }).map((answer) => answer.question)).toEqual(['q1', 'q2', 'q10'])
	})

	it.each(['q2.json.tmp-123-1', 'q.json', 'answer.json', 'q2.json.bak', 'Q2.json', 'q2a.json'])(
		'beside q1.json, %s → never an answer',
		(name) => {
			const lotFolder = lotFolderWithAnswers({ 'q1.json': 1, [name]: 2 })

			expect(readAnswers({ lotFolder }).map((answer) => answer.question)).toEqual(['q1'])
		},
	)

	it('no answers/ folder → none', () => {
		const lotFolder = temporaryFolder('dialecte-answers-')

		expect(readAnswers({ lotFolder })).toEqual([])
	})

	it('an answer record → its question, answer, by and at', () => {
		const lotFolder = lotFolderWithAnswers({ 'q1.json': 1 })

		expect(readAnswers({ lotFolder })).toEqual([answerOf(1)])
	})
})
