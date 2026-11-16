/**
 * Review round 2 of `ask verdict`: a crash after the nonces are claimed is finished by a retry whatever the outcome;
 * a re-ask the readers answer differently is shown to the person, never applied; a verdict keeps the hash of a
 * body, never the body or the session, in what it prints; a missing letter's refusal names a stub file that closes
 * the round.
 */
import { raisedQuestionsOf } from '../../test/ask-answer-fixtures.ts'
import { namesIn } from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { ROUND_ONE } from '../../test/ask-pack-fixtures.constants.ts'
import { readRoundFile } from '../../test/ask-pack-fixtures.ts'
import {
	FORCED_CRASH,
	REASKED_AGREEING_DRAFT,
	REASKED_OUTSIDE_DRAFT,
	REASKED_PERSON_DRAFT,
	REASKED_TEXT,
} from '../../test/ask-review-1-fixtures.constants.ts'
import {
	handReportOf,
	partialRoundOne,
	reaskedOverClauses,
	writeRoundMarker,
} from '../../test/ask-review-1-fixtures.ts'
import { ANSWER_LONG_TEXT, ANSWER_SHORT_TEXT } from '../../test/ask-verdict-fixtures.constants.ts'
import {
	agreeingReportsOf,
	packedForVerdict,
	readerCReportOf,
	readVerdictRecord,
	reportFileOf,
	reportFilesOf,
	reportOf,
	verdictedJson,
	verdictedWith,
} from '../../test/ask-verdict-fixtures.ts'
import { readFactFile } from '../../test/fact-fixtures.ts'
import { STANDARD_DISK_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runAskVerdict } from './ask-verdict.ts'

import { describe, expect, it } from 'vitest'

import type { PackedForVerdict } from '../../test/ask-verdict-fixtures.types.ts'

/** The parameters of one `ask verdict` run over the files, in the packed ask's workspace. */
function runParamsOf(params: { packed: PackedForVerdict; files: string[] }): {
	argv: string[]
	cwd: string
	environment: NodeJS.ProcessEnv
} {
	const { packed } = params
	return {
		argv: [packed.ask, ...params.files, '--json'],
		cwd: packed.workspace.cwd,
		environment: packed.workspace.environment,
	}
}

/** The names of the fact files (not their histories) of a ledger folder. */
function factFilesIn(params: { folder: string }): string[] {
	return namesIn(params.folder).filter((name) => name.endsWith('.json'))
}

describe('ask verdict: a crash after the nonces are claimed is finished by a retry', () => {
	it(
		'a round that asks for another, the run crashing after the nonce claims, then the same verdict again -> exit 3, needs-readers, both reports accepted again',
		async () => {
			const partial = await partialRoundOne()
			const { packed } = partial
			const files = reportFilesOf({
				packed,
				reports: [
					handReportOf({
						partial,
						letter: 'A',
						verdict: 'not-in-text',
						value: null,
						answer: ANSWER_LONG_TEXT,
					}),
					handReportOf({
						partial,
						letter: 'B',
						verdict: 'not-in-text',
						value: null,
						answer: ANSWER_SHORT_TEXT,
					}),
				],
			})

			await expect(
				runAskVerdict({
					...runParamsOf({ packed, files }),
					afterNonces: function crash() {
						throw new Error(FORCED_CRASH)
					},
				}),
			).rejects.toThrow(FORCED_CRASH)
			const retry = await runAskVerdict(runParamsOf({ packed, files }))

			expect({
				exitCode: retry.exitCode,
				verdict: readVerdictRecord({ packed, round: ROUND_ONE }),
			}).toMatchObject({
				exitCode: 3,
				verdict: {
					state: 'needs-readers',
					reports: [
						{ letter: 'A', accepted: true },
						{ letter: 'B', accepted: true },
					],
				},
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a round that goes to the adjudicator, the run crashing after the nonce claims, then the same verdict again -> exit 3, needs-adjudicator, accepted.json keeps the three reports',
		async () => {
			const packed = await packedForVerdict({ argv: ['--effort', 'high'] })
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', claimText: 'AA_1 shall not hold AAA_1' }),
					reportOf({ packed, letter: 'B' }),
					readerCReportOf({ packed }),
				],
			})

			await expect(
				runAskVerdict({
					...runParamsOf({ packed, files }),
					afterNonces: function crash() {
						throw new Error(FORCED_CRASH)
					},
				}),
			).rejects.toThrow(FORCED_CRASH)
			const retry = await runAskVerdict(runParamsOf({ packed, files }))

			expect({
				exitCode: retry.exitCode,
				verdict: readVerdictRecord({ packed, round: ROUND_ONE }),
				kept: readRoundFile({ asked: packed, round: ROUND_ONE, name: 'accepted.json' }),
			}).toMatchObject({
				exitCode: 3,
				verdict: { state: 'needs-adjudicator' },
				kept: { reports: [{ letter: 'A' }, { letter: 'B' }, { letter: 'C' }] },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: a re-ask the readers answer differently is shown to the person, never applied', () => {
	it(
		'readers agree yes on a re-ask of an outside fact that said no -> exit 1, needs-person for the difference, the readers answer kept in verdict.json, no fact recorded, the unchecked fact still current',
		async () => {
			const packed = await reaskedOverClauses({ draft: REASKED_OUTSIDE_DRAFT })
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			const folder = workspaceFactsFolder({ workspace: packed.workspace })
			expect({
				state: json.state,
				verdict: readVerdictRecord({ packed, round: ROUND_ONE }),
				facts: factFilesIn({ folder }),
				asked: readFactFile({ folder, id: packed.factId }),
			}).toMatchObject({
				state: 'needs-person',
				verdict: {
					outcome: {
						state: 'needs-person',
						reason: 'reask-differs',
						agreed: { verdict: 'yes', answer: ANSWER_SHORT_TEXT },
					},
					fact: null,
				},
				facts: [`${packed.factId}.json`],
				asked: { state: 'unchecked', supersededBy: null },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'readers agree yes on a re-ask of a person fact -> shown too (a person text is never a reader verdict): exit 1, no fact recorded, the person fact still current',
		async () => {
			const packed = await reaskedOverClauses({ draft: REASKED_PERSON_DRAFT })
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			const folder = workspaceFactsFolder({ workspace: packed.workspace })
			expect({
				state: json.state,
				reason: (readVerdictRecord({ packed, round: ROUND_ONE }) as { outcome: { reason: string } })
					.outcome.reason,
				facts: factFilesIn({ folder }),
				asked: readFactFile({ folder, id: packed.factId }),
			}).toMatchObject({
				state: 'needs-person',
				reason: 'reask-differs',
				facts: [`${packed.factId}.json`],
				asked: { supersededBy: null },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the same difference on an ask kept with a lot -> the one question raised for the lot holds neither the recorded answer nor the readers answer: the two stay in verdict.json',
		async () => {
			const packed = await reaskedOverClauses({ draft: REASKED_OUTSIDE_DRAFT, inLot: true })
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed, files, exitCode: 1 })

			const questions = raisedQuestionsOf({ lotFolder: packed.lotFolder ?? '' })
			expect({
				count: questions.length,
				names: [REASKED_TEXT, ANSWER_SHORT_TEXT].map((text) =>
					JSON.stringify(questions).includes(text),
				),
			}).toEqual({ count: 1, names: [false, false] })
			expect(readVerdictRecord({ packed, round: ROUND_ONE })).toMatchObject({
				outcome: { reason: 'reask-differs', agreed: { answer: ANSWER_SHORT_TEXT } },
			})
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask verdict: a re-asked fact is not the round recorded fact', () => {
	it(
		'the round marker names the key of a re-asked fact whose history only holds a rechecked line naming the ask, the run having crashed before it recorded -> the retry records the readers fact, never closes on the re-asked one',
		async () => {
			const packed = await reaskedOverClauses({ draft: REASKED_AGREEING_DRAFT })
			writeRoundMarker({ packed, draft: REASKED_AGREEING_DRAFT })
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const json = await verdictedJson({ packed, files, exitCode: 0 })

			expect({
				fact: json.fact,
				facts: factFilesIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
			}).toEqual({ fact: 'F-0002', facts: [`${packed.factId}.json`, 'F-0002.json'] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: the refusal of reports none of which is of the round names the way on', () => {
	it(
		'every report file refused as not of the round -> exit 2 and the refusal names dialecte ask answer with its quoted answer and --by',
		async () => {
			const packed = await packedForVerdict()
			const files = (['A', 'B'] as const).map((letter) =>
				reportFileOf({ packed, name: `broken-${letter}`, report: { ask: packed.ask } }),
			)

			const refusal = await verdictedWith({ packed, files, exitCode: 2 })

			expect(refusal.output).toContain(`dialecte ask answer ${packed.ask} "<answer>" --by <who>`)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: what a verdict keeps and prints of a report', () => {
	it(
		'verdict.json keeps the session and the sha256 of the body of each accepted report, never the body',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed, files, exitCode: 0 })

			const { reports } = readVerdictRecord({ packed, round: ROUND_ONE }) as {
				reports: Record<string, unknown>[]
			}
			expect(
				reports.map((report) => ({
					session: report.session,
					bodyHash: report.bodyHash,
					hasBody: 'body' in report,
				})),
			).toEqual([
				{
					session: 'session-A',
					bodyHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
					hasBody: false,
				},
				{
					session: 'session-B',
					bodyHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
					hasBody: false,
				},
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'ask verdict --json prints each accepted report without its session, its body or its hash',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const json = await verdictedJson({ packed, files, exitCode: 0 })

			expect(
				json.reports.map((report) =>
					['session', 'body', 'bodyHash'].filter((key) => key in report),
				),
			).toEqual([[], []])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: the refusal of a missing report file names --missing, which closes the round', () => {
	it(
		'only reader A gave a report -> the refusal names --missing B and no stub file; run again with --missing B the round closes with B recorded refused missing',
		async () => {
			const packed = await packedForVerdict()
			const [fileA] = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const refusal = await verdictedWith({ packed, files: [fileA ?? ''], exitCode: 2 })
			const closed = await verdictedJson({
				packed,
				files: [fileA ?? ''],
				argv: ['--missing', 'B'],
				exitCode: 1,
			})

			expect({
				namesFlag: refusal.output.includes('--missing B'),
				namesStub: refusal.output.includes('report.json" holding'),
				reports: closed.reports,
			}).toMatchObject({
				namesFlag: true,
				namesStub: false,
				reports: [
					{ letter: 'A', accepted: true },
					{ letter: 'B', accepted: false, refused: 'missing' },
				],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
