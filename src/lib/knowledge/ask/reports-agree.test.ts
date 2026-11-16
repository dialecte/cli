import {
	CLAUSE_ONE,
	CLAUSE_TWO,
	LINES_APART,
	LINES_SHARING,
	VALUE_B_THEN_A,
	VALUE_OTHER,
	VALUE_UPPER_A_THEN_B,
} from '../../../../test/ask-agreement-fixtures.constants.ts'
import { documentAcceptedOf } from '../../../../test/ask-agreement-fixtures.ts'
import { REPORT_OTHER_FILE } from '../../../../test/ask-report-fixtures.constants.ts'
import { reportsAgree } from './reports-agree.ts'

import { describe, expect, it } from 'vitest'

import type { AskKind, ReportsAgreeParams } from './ask.types.ts'

/** The reports of a case as `reportsAgree` takes them, the question a semantic one unless said. */
function caseOf(params: Omit<ReportsAgreeParams, 'kind'> & { kind?: AskKind }): ReportsAgreeParams {
	return { kind: 'semantic', ...params }
}

const AGREE_ROWS: Record<string, { reports: ReportsAgreeParams; agree: boolean }> = {
	'equal verdicts, equal values and a shared line -> agree': {
		reports: caseOf({
			first: documentAcceptedOf({ letter: 'A' }),
			second: documentAcceptedOf({ letter: 'B', lines: LINES_SHARING, clause: CLAUSE_TWO }),
		}),
		agree: true,
	},
	'a shared clause leaf and no shared line -> agree': {
		reports: caseOf({
			first: documentAcceptedOf({ letter: 'A' }),
			second: documentAcceptedOf({ letter: 'B', lines: LINES_APART, clause: CLAUSE_ONE }),
		}),
		agree: true,
	},
	'no shared line and no shared clause -> not': {
		reports: caseOf({
			first: documentAcceptedOf({ letter: 'A' }),
			second: documentAcceptedOf({ letter: 'B', lines: LINES_APART, clause: CLAUSE_TWO }),
		}),
		agree: false,
	},
	'the same line numbers in another file, in another clause -> not': {
		reports: caseOf({
			first: documentAcceptedOf({ letter: 'A' }),
			second: documentAcceptedOf({ letter: 'B', file: REPORT_OTHER_FILE, clause: CLAUSE_TWO }),
		}),
		agree: false,
	},
	'a refused cite sharing a line with the first, the verified cite apart -> not: only verified cites count':
		{
			reports: caseOf({
				first: documentAcceptedOf({ letter: 'A' }),
				second: documentAcceptedOf({
					letter: 'B',
					lines: LINES_APART,
					clause: CLAUSE_TWO,
					refusedCiteLines: LINES_SHARING,
				}),
			}),
			agree: false,
		},
	'different verdicts -> not': {
		reports: caseOf({
			first: documentAcceptedOf({ letter: 'A', verdict: 'yes' }),
			second: documentAcceptedOf({ letter: 'B', verdict: 'no' }),
		}),
		agree: false,
	},
	'a polarity conflict on the first -> not': {
		reports: caseOf({
			first: documentAcceptedOf({ letter: 'A', polarityConflict: true }),
			second: documentAcceptedOf({ letter: 'B' }),
		}),
		agree: false,
	},
	'a polarity conflict on the second -> not': {
		reports: caseOf({
			first: documentAcceptedOf({ letter: 'A' }),
			second: documentAcceptedOf({ letter: 'B', polarityConflict: true }),
		}),
		agree: false,
	},
	'a values question with the same names in another order, case and spacing -> agree': {
		reports: caseOf({
			kind: 'values',
			first: documentAcceptedOf({ letter: 'A', verdict: 'value', value: VALUE_B_THEN_A }),
			second: documentAcceptedOf({ letter: 'B', verdict: 'value', value: VALUE_UPPER_A_THEN_B }),
		}),
		agree: true,
	},
	'a values question with another name -> not': {
		reports: caseOf({
			kind: 'values',
			first: documentAcceptedOf({ letter: 'A', verdict: 'value', value: VALUE_B_THEN_A }),
			second: documentAcceptedOf({ letter: 'B', verdict: 'value', value: VALUE_OTHER }),
		}),
		agree: false,
	},
	'another kind with the same names in another order -> not: only a values question compares as sets':
		{
			reports: caseOf({
				kind: 'children',
				first: documentAcceptedOf({ letter: 'A', verdict: 'value', value: VALUE_B_THEN_A }),
				second: documentAcceptedOf({ letter: 'B', verdict: 'value', value: VALUE_UPPER_A_THEN_B }),
			}),
			agree: false,
		},
}

describe('reportsAgree: two accepted reports agree when verdict, value, polarity and cites agree (case 31)', () => {
	it.each(Object.entries(AGREE_ROWS))('%s', (_title, row) => {
		expect(reportsAgree(row.reports)).toBe(row.agree)
	})
})
