import { namesIn } from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { ROUND_ONE } from '../../test/ask-pack-fixtures.constants.ts'
import {
	ANSWER_LONG_TEXT,
	DECISION_QUESTION,
	DECISION_REJECTED_ITEM,
	FIRST_FACT,
	WEB_CITE,
} from '../../test/ask-verdict-fixtures.constants.ts'
import {
	outsideReportOf,
	packedOutsideForVerdict,
	readVerdictRecord,
	reportFilesOf,
	verdictedJson,
} from '../../test/ask-verdict-fixtures.ts'
import { readFactFile } from '../../test/fact-fixtures.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

describe('ask verdict: outside readers answer in one round (section 18, cases 32h, 32i, 32r)', () => {
	it(
		'two model readers that agree -> exit 0 and an unchecked outside fact whose sources name the model',
		async () => {
			const packed = await packedOutsideForVerdict()
			const reports = [
				outsideReportOf({ packed, letter: 'A', answer: ANSWER_LONG_TEXT }),
				outsideReportOf({ packed, letter: 'B' }),
			]

			const json = await verdictedJson({
				packed,
				files: reportFilesOf({ packed, reports }),
				exitCode: 0,
			})

			expect({
				json,
				fact: readFactFile({
					folder: workspaceFactsFolder({ workspace: packed.workspace }),
					id: FIRST_FACT,
				}),
			}).toMatchObject({
				json: { state: 'answered', fact: FIRST_FACT },
				fact: { source: 'outside', unchecked: true, sources: [{ kind: 'model' }] },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'one web reader and one model reader that agree (pack --outside --web) -> both kinds in the sources, the page kept',
		async () => {
			const packed = await packedOutsideForVerdict({ web: true })
			const reports = [
				outsideReportOf({ packed, letter: 'A', source: 'web', answer: ANSWER_LONG_TEXT }),
				outsideReportOf({ packed, letter: 'B', source: 'model' }),
			]

			await verdictedJson({ packed, files: reportFilesOf({ packed, reports }), exitCode: 0 })

			expect(
				readFactFile({
					folder: workspaceFactsFolder({ workspace: packed.workspace }),
					id: FIRST_FACT,
				}),
			).toMatchObject({
				source: 'outside',
				unchecked: true,
				sources: expect.arrayContaining([{ kind: 'model' }, { kind: 'web', urls: [WEB_CITE.url] }]),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'one reader answering not-known -> exit 1, the person next, no fact',
		async () => {
			const packed = await packedOutsideForVerdict()
			const reports = [
				outsideReportOf({ packed, letter: 'A', answer: ANSWER_LONG_TEXT }),
				outsideReportOf({ packed, letter: 'B', verdict: 'not-known' }),
			]

			const json = await verdictedJson({
				packed,
				files: reportFilesOf({ packed, reports }),
				exitCode: 1,
			})

			expect({
				state: json.state,
				fact: json.fact,
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toEqual({ state: 'needs-person', fact: null, facts: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a hedged answer counts as not-known -> exit 1, no fact',
		async () => {
			const packed = await packedOutsideForVerdict()
			const reports = [
				outsideReportOf({ packed, letter: 'A', answer: ANSWER_LONG_TEXT }),
				outsideReportOf({ packed, letter: 'B', answer: 'It probably holds the child.' }),
			]

			const json = await verdictedJson({
				packed,
				files: reportFilesOf({ packed, reports }),
				exitCode: 1,
			})

			expect({ state: json.state, fact: json.fact }).toEqual({ state: 'needs-person', fact: null })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an agreement contradicting the definition read live -> exit 1, the person next, no fact',
		async () => {
			const packed = await packedOutsideForVerdict({
				question: DECISION_QUESTION,
				argv: ['--decision'],
			})
			const reports = [
				outsideReportOf({
					packed,
					letter: 'A',
					verdict: 'value',
					value: DECISION_REJECTED_ITEM,
					answer: ANSWER_LONG_TEXT,
				}),
				outsideReportOf({ packed, letter: 'B', verdict: 'value', value: DECISION_REJECTED_ITEM }),
			]

			const json = await verdictedJson({
				packed,
				files: reportFilesOf({ packed, reports }),
				exitCode: 1,
			})

			expect({
				state: json.state,
				fact: json.fact,
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
				outcome: (readVerdictRecord({ packed, round: ROUND_ONE }) as { outcome: unknown }).outcome,
			}).toEqual({
				state: 'needs-person',
				fact: null,
				facts: [],
				outcome: { state: 'needs-person', reason: 'contradicts-definition' },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
