import {
	EXPLAINED_ENTRY,
	INDEX_ANGLES_QUESTION,
} from '../../../../test/angles-standard-fixtures.constants.ts'
import { indexFamiliesIndex } from '../../../../test/angles-standard-fixtures.ts'
import { resolvedContext, subjectOf } from '../../../../test/ask-fixtures.ts'
import { anglesOf } from './angles-of.ts'

import { describe, expect, it } from 'vitest'

import type { AnglesOfParams, AskAngle } from './ask.types.ts'

function paramsOf(): AnglesOfParams {
	return {
		subject: subjectOf({ tags: [{ tag: 'AA_1' }] }),
		context: resolvedContext({
			packageName: '@dialecte/core-test',
			tag: 'AA_1',
			parent: null,
			declarations: 1,
		}),
		kind: 'semantic',
		question: INDEX_ANGLES_QUESTION,
		dialecte: undefined,
		methods: [],
		explained: [EXPLAINED_ENTRY],
		standard: [indexFamiliesIndex()],
	}
}

type FamilyRow = { angle: AskAngle }

describe('anglesOf: the families read from the index and the explained code (D11b)', () => {
	// ids follow the family order: subject a1, code a2, definitions a3, clauses a4, tables a5, question a6
	const rows: Record<string, FamilyRow> = {
		'code: the words of the explained message, then the vocabulary tags it names (AA_1 stays with the subject)':
			{ angle: { id: 'a2', family: 'code', terms: ['aa', '1', 'fail', 'load'] } },
		'definitions: the defined terms whose term or text holds the subject (beta thing does not)': {
			angle: { id: 'a3', family: 'definitions', terms: ['AA_1 node'] },
		},
		'clauses: the title words of the clause headed by AA_1, then of the clause it cites': {
			angle: { id: 'a4', family: 'clauses', terms: ['structur', 'order', 'rul'] },
		},
		'tables: the caption words of the table whose caption names AA_1': {
			angle: { id: 'a5', family: 'tables', terms: ['tabl', 'valu'] },
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(anglesOf(paramsOf()).find((angle) => angle.family === row.angle.family)).toEqual(
				row.angle,
			)
		})

	it('the whole list: families in order, ids a1 to a6', () => {
		expect(anglesOf(paramsOf()).map((angle) => angle.family)).toEqual([
			'subject',
			'code',
			'definitions',
			'clauses',
			'tables',
			'question',
		])
	})
})
