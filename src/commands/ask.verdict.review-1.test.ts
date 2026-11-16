/**
 * Review round 1 of `ask verdict`: nothing left to give closes the round (R1-3), a crash between the fact and the
 * round's record is completed by a retry (R1-4), a session or a body is unique across every round of the ask (R1-7),
 * every issued letter has a report file (R1-8), a cite reads the lines it names only (R1-9), the fact keeps the
 * tiers of the agreeing readers (R1-19).
 */
import { otherClauseOf, raisedQuestionsOf } from '../../test/ask-answer-fixtures.ts'
import { bodyHashOf } from '../../test/ask-body-hash.ts'
import { namesIn } from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { ROUND_ONE, ROUND_TWO } from '../../test/ask-pack-fixtures.constants.ts'
import { packedWith, roundFolderOf, writeRoundOne } from '../../test/ask-pack-fixtures.ts'
import {
	BODY_HASH_ROUND_ONE_A,
	EARLIER_STANDARD_DRAFT,
	FORCED_CRASH,
	OTHER_QUOTE_ACROSS_THE_LINES,
	QUOTE_ACROSS_THE_LINES,
	SESSION_ROUND_ONE_A,
	TIER_FAST,
	TIER_STRONG,
	TWO_LINE_STANDARDS,
} from '../../test/ask-review-1-fixtures.constants.ts'
import {
	acceptedEntryOf,
	packedInLot,
	packedRoundTwoAfter,
	recordFactOfAsk,
	reportOfHeldClause,
} from '../../test/ask-review-1-fixtures.ts'
import {
	ADJUDICATOR_BRIEF_JSON,
	ADJUDICATOR_BRIEF_MARKDOWN,
	ANSWER_LONG_TEXT,
	FIRST_FACT,
} from '../../test/ask-verdict-fixtures.constants.ts'
import {
	adjudicatorReportOf,
	agreeingReportsOf,
	packedForAdjudicator,
	packedForVerdict,
	readVerdictRecord,
	reportFileOf,
	reportFilesOf,
	reportOf,
	verdictedJson,
	verdictedWith,
} from '../../test/ask-verdict-fixtures.ts'
import { readFactFile, readHistoryFile } from '../../test/fact-fixtures.ts'
import { STANDARD_DISK_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runAskVerdict } from './ask-verdict.ts'

import { describe, expect, it } from 'vitest'

import type { PackedForVerdict } from '../../test/ask-verdict-fixtures.types.ts'
import type { DocumentReport } from '../lib/knowledge/ask/ask.types.ts'
import type { ModelTierName } from '../lib/models/model-tiers.types.ts'

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

/** A report whose cites name the first line of their range only. */
function citingOneLine(params: { report: DocumentReport }): DocumentReport {
	const { report } = params
	return {
		...report,
		claims: report.claims.map((claim) => ({
			...claim,
			cites: claim.cites.map((cite) => ({ ...cite, to: cite.from })),
		})),
	}
}

describe('ask verdict: nothing left to give closes a round that did not agree', () => {
	it(
		'high, two readers agree and the third dissents, nothing left -> exit 3, needs-adjudicator and ask pack named; the pack then writes the adjudicator brief',
		async () => {
			const packed = await packedForVerdict({ argv: ['--effort', 'high'] })
			const dissent = reportOfHeldClause({
				packed,
				letter: 'C',
				verdict: 'depends',
				value: 'when it is listed',
			})
			const files = reportFilesOf({ packed, reports: [...agreeingReportsOf({ packed }), dissent] })

			const json = await verdictedJson({ packed, files, exitCode: 3 })

			expect(json).toMatchObject({
				state: 'needs-adjudicator',
				fact: null,
				next: `dialecte ask pack ${packed.ask}`,
			})
			await packedWith({ workspace: packed.workspace, argv: [packed.ask], exitCode: 0 })
			expect(namesIn(roundFolderOf({ asked: packed, round: ROUND_TWO }))).toEqual(
				expect.arrayContaining([ADJUDICATOR_BRIEF_JSON, ADJUDICATOR_BRIEF_MARKDOWN]),
			)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'medium, in a lot, the readers cite different clauses, nothing left -> exit 1, needs-person recorded and one question raised for the lot',
		async () => {
			const packed = await packedInLot()
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', clause: 'first', answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', clause: 'second' }),
				],
			})

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			expect({
				state: json.state,
				verdict: readVerdictRecord({ packed, round: ROUND_ONE }),
				questions: raisedQuestionsOf({ lotFolder: packed.lotFolder }),
			}).toMatchObject({
				state: 'needs-person',
				verdict: { outcome: { state: 'needs-person' }, state: 'needs-person' },
				questions: [{ audience: 'person', ask: packed.ask }],
			})
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask verdict: a crash between the fact and the round record is completed by a retry', () => {
	it(
		'a crash right after the fact is recorded, then the same verdict again -> exit 0, one fact recorded once, the round closed on it',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await expect(
				runAskVerdict({
					...runParamsOf({ packed, files }),
					afterFact: function crash() {
						throw new Error(FORCED_CRASH)
					},
				}),
			).rejects.toThrow(FORCED_CRASH)
			const retry = await runAskVerdict(runParamsOf({ packed, files }))

			const folder = workspaceFactsFolder({ workspace: packed.workspace })
			expect({
				exitCode: retry.exitCode,
				facts: factFilesIn({ folder }),
				events: readHistoryFile({ folder, id: FIRST_FACT }).map((line) => line.event),
				verdict: readVerdictRecord({ packed, round: ROUND_ONE }),
			}).toMatchObject({
				exitCode: 0,
				facts: [`${FIRST_FACT}.json`],
				events: ['created'],
				verdict: { state: 'answered', fact: FIRST_FACT },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a fact with the ask in its history but no marker of this round (another asks folder holds an ask of the same id) -> not taken for this round: the verdict records its own fact',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })
			const other = recordFactOfAsk({ asked: packed, draft: EARLIER_STANDARD_DRAFT })

			const json = await verdictedJson({ packed, files, exitCode: 0 })

			const folder = workspaceFactsFolder({ workspace: packed.workspace })
			expect({
				json,
				facts: factFilesIn({ folder }),
				events: readHistoryFile({ folder, id: other }).map((line) => line.event),
				verdict: readVerdictRecord({ packed, round: ROUND_ONE }),
			}).toMatchObject({
				json: { state: 'answered', fact: 'F-0002' },
				facts: [`${other}.json`, 'F-0002.json'],
				events: ['created'],
				verdict: { state: 'answered', fact: 'F-0002' },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: a session or a body is unique across every round of the ask', () => {
	it(
		'second round: reader B gives the session reader A of the first round gave -> B is refused same-session, A accepted',
		async () => {
			const roundTwo = await packedRoundTwoAfter({
				reports: [
					acceptedEntryOf({
						letter: 'A',
						session: SESSION_ROUND_ONE_A,
						bodyHash: BODY_HASH_ROUND_ONE_A,
					}),
				],
			})
			const { packed } = roundTwo
			const clause = otherClauseOf({ clause: roundTwo.roundOneClause })
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', clause, answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', clause, session: SESSION_ROUND_ONE_A }),
				],
			})

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			expect(json.reports).toMatchObject([
				{ letter: 'A', accepted: true },
				{ accepted: false, refused: 'same-session' },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'second round: reader B gives a report whose body equals the one reader A of the first round gave -> B is refused duplicate',
		async () => {
			const roundTwo = await packedRoundTwoAfter({ reports: [] })
			const { packed } = roundTwo
			const clause = otherClauseOf({ clause: roundTwo.roundOneClause })
			const reportB = reportOf({ packed, letter: 'B', clause })
			// the verdict of round 1 kept the body of this very report under reader A, from another session
			writeRoundOne({
				asked: packed,
				given: 'first',
				reports: [
					acceptedEntryOf({
						letter: 'A',
						session: SESSION_ROUND_ONE_A,
						bodyHash: bodyHashOf({ report: reportB }),
					}),
				],
			})
			const files = reportFilesOf({
				packed,
				reports: [reportOf({ packed, letter: 'A', clause, answer: ANSWER_LONG_TEXT }), reportB],
			})

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			expect(json.reports).toMatchObject([
				{ letter: 'A', accepted: true },
				{ accepted: false, refused: 'duplicate' },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the adjudicator gives the session reader A gave in the readers round -> refused same-session, exit 1, no fact',
		async () => {
			const { packed, round, nonce } = await packedForAdjudicator()
			const [file] = reportFilesOf({
				packed,
				reports: [{ ...adjudicatorReportOf({ packed, round, nonce }), session: 'session-A' }],
			})

			const json = await verdictedJson({
				packed,
				files: [file ?? ''],
				argv: ['--adjudicator'],
				exitCode: 1,
			})

			expect({
				reports: json.reports,
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toMatchObject({ reports: [{ accepted: false, refused: 'same-session' }], facts: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: a round needs one report file per issued letter', () => {
	it(
		'only reader A gave a report -> exit 2 naming the missing letter B, nothing recorded: no verdict, no nonce claimed, no fact',
		async () => {
			const packed = await packedForVerdict()
			const [fileA] = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })
			const before = namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE }))

			const answer = await verdictedWith({ packed, files: [fileA ?? ''], exitCode: 2 })

			expect({
				says: answer.output,
				round: namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE })),
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toEqual({ says: expect.stringMatching(/\bB\b/u), round: before, facts: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'two report files of reader A and none of reader B -> exit 2, nothing recorded',
		async () => {
			const packed = await packedForVerdict()
			const [reportA] = agreeingReportsOf({ packed })
			const files = [
				reportFileOf({ packed, name: 'report-A-once', report: reportA }),
				reportFileOf({ packed, name: 'report-A-twice', report: reportA }),
			]
			const before = namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE }))

			await verdictedWith({ packed, files, exitCode: 2 })

			expect({
				round: namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE })),
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toEqual({ round: before, facts: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: a cite is read on the lines it names only', () => {
	it(
		'two readers cite one line each and quote words that run on into the next line of the paragraph -> both refused no-verified-claim, quote-not-found, the person next, no fact',
		async () => {
			const packed = await packedForVerdict({ standards: TWO_LINE_STANDARDS })
			const reportA = reportOf({
				packed,
				letter: 'A',
				quote: QUOTE_ACROSS_THE_LINES,
				answer: ANSWER_LONG_TEXT,
			})
			const reportB = reportOf({ packed, letter: 'B', quote: OTHER_QUOTE_ACROSS_THE_LINES })
			const files = reportFilesOf({
				packed,
				reports: [citingOneLine({ report: reportA }), citingOneLine({ report: reportB })],
			})

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			expect({
				state: json.state,
				reports: json.reports,
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toMatchObject({
				state: 'needs-person',
				reports: [
					{
						accepted: false,
						refused: 'no-verified-claim',
						faults: expect.arrayContaining([expect.stringContaining('quote-not-found')]),
					},
					{ accepted: false, refused: 'no-verified-claim' },
				],
				facts: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: the fact holds the tiers of the agreeing readers', () => {
	const rows: Record<string, { tiers: [ModelTierName, ModelTierName]; expected: string[] }> = {
		'two readers on two tiers agree -> by.tiers lists both, sorted': {
			tiers: [TIER_STRONG, TIER_FAST],
			expected: [TIER_FAST, TIER_STRONG],
		},
		'two readers on the same tier agree -> by.tiers lists it once': {
			tiers: [TIER_STRONG, TIER_STRONG],
			expected: [TIER_STRONG],
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(
			name,
			async () => {
				const packed = await packedForVerdict()
				const [reportA, reportB] = agreeingReportsOf({ packed })
				const files = reportFilesOf({
					packed,
					reports: [
						{ ...reportA, tier: row.tiers[0] },
						{ ...reportB, tier: row.tiers[1] },
					],
				})

				await verdictedWith({ packed, files, exitCode: 0 })

				expect(
					readFactFile({
						folder: workspaceFactsFolder({ workspace: packed.workspace }),
						id: FIRST_FACT,
					}),
				).toMatchObject({ by: { tiers: row.expected } })
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})
