import { readFactFile, readHistoryFile } from '../../../../test/fact-fixtures.ts'
import { fixedNow, reaskEdgeScenario, reaskScenario } from '../../../../test/reask-fixtures.ts'
import {
	CLAIMED_ASKS,
	OTHER_PACKAGE,
	REASK_PACKAGE,
	REASK_QUESTIONS,
} from '../../../../test/standard-selection.constants.ts'
import { reaskUnchecked } from './reask-unchecked.ts'

import { describe, expect, it } from 'vitest'

describe('reaskUnchecked: only a rechecked line with the reason documents, and only a current fact, count (D15)', () => {
	it('a fact whose history holds a rechecked line of another reason, or of none, is re-asked', () => {
		const scenario = reaskEdgeScenario()

		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [REASK_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toEqual(['F-0001', 'F-0002'])
		expect(scenario.claimed).toEqual([
			{ question: REASK_QUESTIONS.otherReason },
			{ question: REASK_QUESTIONS.noReason },
		])
	})

	it('a superseded unchecked fact is never re-asked: its successor answers for the key', () => {
		const scenario = reaskEdgeScenario()

		expect(readFactFile({ folder: scenario.folder, id: 'F-0003' })).toMatchObject({
			supersededBy: 'F-0004',
		})
		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [REASK_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).not.toContain('F-0003')
		expect(readHistoryFile({ folder: scenario.folder, id: 'F-0003' })).not.toContainEqual(
			expect.objectContaining({ event: 'rechecked', reason: 'documents' }),
		)
	})
})

describe('reaskUnchecked: documents now exist, the unchecked facts are asked again once (D15, case 32j)', () => {
	it('two current unchecked facts of the listed package -> one ask each, the question only, their ids returned', () => {
		const scenario = reaskScenario()

		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [REASK_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toEqual(['F-0001', 'F-0002'])
		expect(scenario.claimed).toEqual([
			{ question: REASK_QUESTIONS.first },
			{ question: REASK_QUESTIONS.second },
		])
	})

	it('each fact re-asked gets one rechecked line naming its new ask and the reason documents', () => {
		const scenario = reaskScenario()

		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [REASK_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toHaveLength(2)
		expect(readHistoryFile({ folder: scenario.folder, id: 'F-0001' })).toContainEqual(
			expect.objectContaining({
				event: 'rechecked',
				fact: 'F-0001',
				ask: CLAIMED_ASKS[0],
				reason: 'documents',
			}),
		)
		expect(readHistoryFile({ folder: scenario.folder, id: 'F-0002' })).toContainEqual(
			expect.objectContaining({
				event: 'rechecked',
				fact: 'F-0002',
				ask: CLAIMED_ASKS[1],
				reason: 'documents',
			}),
		)
	})

	it('a fact of another package, a fact already re-asked and a standard fact are left as they were', () => {
		const scenario = reaskScenario()
		const before = ['F-0003', 'F-0004', 'F-0005'].map((id) => ({
			id,
			history: readHistoryFile({ folder: scenario.folder, id }),
			fact: readFactFile({ folder: scenario.folder, id }),
		}))

		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [REASK_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toEqual(['F-0001', 'F-0002'])
		expect(
			before.map(({ id }) => ({
				id,
				history: readHistoryFile({ folder: scenario.folder, id }),
				fact: readFactFile({ folder: scenario.folder, id }),
			})),
		).toEqual(before)
	})

	it('a second call re-asks nothing: no new ask, no new line', () => {
		const scenario = reaskScenario()

		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [REASK_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toEqual(['F-0001', 'F-0002'])
		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [REASK_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toEqual([])
		expect(scenario.claimed).toHaveLength(2)
		expect(
			readHistoryFile({ folder: scenario.folder, id: 'F-0001' }).filter(
				(line) => line.event === 'rechecked',
			),
		).toHaveLength(1)
	})

	it('the package whose standard has documents is the only one re-asked: another listed alone asks its own fact', () => {
		const scenario = reaskScenario()

		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [OTHER_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toEqual(['F-0003'])
		expect(scenario.claimed).toEqual([{ question: REASK_QUESTIONS.elsewhere }])
	})

	it('the fact files are unchanged by a re-ask: only the history grows', () => {
		const scenario = reaskScenario()
		const ids = ['F-0001', 'F-0002', 'F-0003', 'F-0004', 'F-0005']
		const before = ids.map((id) => readFactFile({ folder: scenario.folder, id }))

		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [REASK_PACKAGE],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toHaveLength(2)
		expect(ids.map((id) => readFactFile({ folder: scenario.folder, id }))).toEqual(before)
	})

	it('no package listed -> nothing re-asked', () => {
		const scenario = reaskScenario()

		expect(
			reaskUnchecked({
				factsFolder: scenario.folder,
				packages: [],
				claim: scenario.claim,
				now: fixedNow,
			}),
		).toEqual([])
		expect(scenario.claimed).toEqual([])
	})
})
