/**
 * Independent review of `ask verdict`: what a reader was given is the ranges the pack recorded (I-6), a high round
 * with nothing left reaches the adjudicator (I-8), the next command of a lot's person is the lot's (I-7), a clause
 * title names the subject (I-3), what the verdict keeps and hands the person (I-5, I-11, I-15), its events (I-9) and
 * a reader that wrote nothing is declared (I-12).
 */
import {
	CLAUSE_LINES,
	CLAUSE_SENTENCES,
	CITED_FILE,
} from '../../test/ask-answer-fixtures.constants.ts'
import {
	askedPersonOnly,
	otherClauseOf,
	personAnsweredJson,
	raisedQuestionsOf,
} from '../../test/ask-answer-fixtures.ts'
import { eventsPathIn, namesIn, readEventsFile } from '../../test/ask-command-workspace.ts'
import { HIGH_EFFORT, ROUND_ONE, ROUND_TWO } from '../../test/ask-pack-fixtures.constants.ts'
import {
	askedForPack,
	packedWith,
	roundFolderOf,
	writeRoundOne,
} from '../../test/ask-pack-fixtures.ts'
import {
	FIRST_QUESTION,
	HEADED_CLAIM_TEXT,
	HEADED_QUOTE_LONG,
	HEADED_QUOTE_SHORT,
	HEADED_STANDARDS,
	POOR_BLOCK_STANDARDS,
} from '../../test/ask-review-1-fixtures.constants.ts'
import { packedInLot, packedRoundTwoAfter, swapPoolIds } from '../../test/ask-review-1-fixtures.ts'
import {
	ADJUDICATOR_BRIEF_JSON,
	ANSWER_LONG_TEXT,
	ANSWER_SHORT_TEXT,
	FIRST_CLAUSE_SENTENCE,
	FIRST_FACT,
} from '../../test/ask-verdict-fixtures.constants.ts'
import {
	agreeingReportsOf,
	claimNonceOf,
	outsideReportOf,
	packedForVerdict,
	packedOutsideForVerdict,
	readVerdictRecord,
	reportFilesOf,
	reportOf,
	verdictedJson,
	verdictedWith,
} from '../../test/ask-verdict-fixtures.ts'
import { LOT_NAME } from '../../test/lot-stores.constants.ts'
import { STANDARD_DISK_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { writeAcceptedReports } from '../lib/knowledge/ask/accepted-reports-file.ts'
import { runAskVerdict } from './ask-verdict.ts'

import { describe, expect, it } from 'vitest'

import type { PackedForVerdict } from '../../test/ask-verdict-fixtures.types.ts'
import type { DocumentReport } from '../lib/knowledge/ask/ask.types.ts'

/** A verdict over the files whose rebuilt pool has its first two slices' ids exchanged: another search order. */
async function reindexedVerdictJson(params: {
	packed: PackedForVerdict
	files: string[]
}): Promise<{ reports: Record<string, unknown>[] }> {
	const { packed } = params
	const run = await runAskVerdict({
		argv: [packed.ask, ...params.files, '--json'],
		cwd: packed.workspace.cwd,
		environment: packed.workspace.environment,
		reindexPool: swapPoolIds,
	})
	return JSON.parse(run.output) as { reports: Record<string, unknown>[] }
}

/** The report with its one cite moved to the sentence of a clause (whatever its brief gave). */
function citingClause(params: {
	report: DocumentReport
	clause: 'first' | 'second'
}): DocumentReport {
	const { report, clause } = params
	const line = CLAUSE_LINES[clause]
	return {
		...report,
		claims: report.claims.map((claim) => ({
			...claim,
			cites: [{ file: CITED_FILE, from: line, to: line, quote: CLAUSE_SENTENCES[clause] }],
		})),
	}
}

describe('ask verdict: what a reader was given is what the pack recorded, not a rebuilt pool', () => {
	it(
		'the rebuilt pool numbers its slices in another order than the pack did -> a cite inside the reader brief stays verified',
		async () => {
			const roundTwo = await packedRoundTwoAfter({ reports: [] })
			const { packed } = roundTwo
			const clause = otherClauseOf({ clause: roundTwo.roundOneClause })
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', clause, answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', clause }),
				],
			})

			const json = await reindexedVerdictJson({ packed, files })

			expect(json.reports).toMatchObject([
				{ letter: 'A', accepted: true, claims: [{ verified: true }] },
				{ letter: 'B', accepted: true, claims: [{ verified: true }] },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the same renumbering -> a cite outside the reader brief (the clause of the first round) stays not-given',
		async () => {
			const roundTwo = await packedRoundTwoAfter({ reports: [] })
			const { packed } = roundTwo
			const clause = otherClauseOf({ clause: roundTwo.roundOneClause })
			function outside(letter: 'A' | 'B'): DocumentReport {
				return citingClause({
					report: reportOf({
						packed,
						letter,
						clause,
						answer: letter === 'A' ? ANSWER_LONG_TEXT : ANSWER_SHORT_TEXT,
					}),
					clause: roundTwo.roundOneClause,
				})
			}
			const files = reportFilesOf({ packed, reports: [outside('A'), outside('B')] })

			const json = await reindexedVerdictJson({ packed, files })

			expect(json.reports).toMatchObject([
				{ accepted: false, faults: expect.arrayContaining([expect.stringContaining('not-given')]) },
				{ accepted: false, faults: expect.arrayContaining([expect.stringContaining('not-given')]) },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask pack: a high round with nothing left to give and no answering report goes to the person', () => {
	it(
		'a high ask whose first round gave every reader every slice, none of its accepted reports answering -> the pack ends the ask at needs-person (exit 1): no adjudicator brief is written',
		async () => {
			const asked = await askedForPack({ argv: ['--effort', HIGH_EFFORT] })
			writeRoundOne({ asked, given: 'all', high: true })
			writeAcceptedReports({
				folder: roundFolderOf({ asked, round: ROUND_ONE }),
				ask: asked.ask,
				round: 1,
				reports: [],
			})

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--json'],
				exitCode: 1,
			})

			expect({
				state: (JSON.parse(answer.output) as { state: string }).state,
				brief: namesIn(roundFolderOf({ asked, round: ROUND_TWO })).includes(ADJUDICATOR_BRIEF_JSON),
			}).toEqual({ state: 'needs-person', brief: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: the next command of a person in a store lot is the lot answer', () => {
	it(
		'readers that cite different clauses in an ask kept with a lot, nothing left -> next is dialecte lot answer <lot> <question>, in the json and in verdict.json',
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

			const next = `dialecte lot answer ${LOT_NAME} ${FIRST_QUESTION}`
			expect({
				json: json.next,
				record: (readVerdictRecord({ packed, round: ROUND_ONE }) as { next: string }).next,
			}).toEqual({ json: next, record: next })
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask verdict: a clause headed by the subject makes its sentence about the subject', () => {
	it(
		'two readers quote a sentence that names only the child, under a clause titled with the tag -> verified, answered',
		async () => {
			const packed = await packedForVerdict({ standards: HEADED_STANDARDS })
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({
						packed,
						letter: 'A',
						claimText: HEADED_CLAIM_TEXT,
						quote: HEADED_QUOTE_LONG,
						answer: ANSWER_LONG_TEXT,
					}),
					reportOf({
						packed,
						letter: 'B',
						claimText: HEADED_CLAIM_TEXT,
						quote: HEADED_QUOTE_SHORT,
					}),
				],
			})

			const json = await verdictedJson({ packed, files, exitCode: 0 })

			expect(json).toMatchObject({ state: 'answered', fact: FIRST_FACT })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: what a verdict keeps of each accepted report, and tells the person', () => {
	it(
		'verdict.json keeps the answer, the families read and what was not found of each accepted report',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed, files, exitCode: 0 })

			const { reports } = readVerdictRecord({ packed, round: ROUND_ONE }) as {
				reports: Record<string, unknown>[]
			}
			expect(reports).toMatchObject([
				{ letter: 'A', answer: ANSWER_LONG_TEXT, familiesRead: ['parents'], notFound: [] },
				{ letter: 'B', answer: ANSWER_SHORT_TEXT, familiesRead: ['parents'], notFound: [] },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an outside reader whose answer is hedged -> verdict.json keeps notKnown true for it, false for the other',
		async () => {
			const packed = await packedOutsideForVerdict()
			const files = reportFilesOf({
				packed,
				reports: [
					outsideReportOf({ packed, letter: 'A', answer: ANSWER_LONG_TEXT }),
					outsideReportOf({ packed, letter: 'B', answer: 'It probably holds the child.' }),
				],
			})

			await verdictedWith({ packed, files, exitCode: 1 })

			expect(readVerdictRecord({ packed, round: ROUND_ONE })).toMatchObject({
				reports: [
					{ letter: 'A', notKnown: false },
					{ letter: 'B', notKnown: true },
				],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'readers that disagree, handed to the person of a lot -> the lot question details hold no answer of a reader and point to the verdict of the round by a path relative to the lot folder',
		async () => {
			const packed = await packedInLot()
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', clause: 'first', answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', clause: 'second', answer: ANSWER_SHORT_TEXT }),
				],
			})

			await verdictedWith({ packed, files, exitCode: 1 })

			const details = raisedQuestionsOf({ lotFolder: packed.lotFolder })[0]?.details ?? ''
			expect({
				holdsAnswers: [ANSWER_LONG_TEXT, ANSWER_SHORT_TEXT].map((text) => details.includes(text)),
				pointsToVerdict: details.includes(`asks/${packed.ask}/rounds/round-1/verdict.json`),
				absolute: details.includes(packed.lotFolder),
				namesAsk: details.includes(packed.ask),
			}).toEqual({
				holdsAnswers: [false, false],
				pointsToVerdict: true,
				absolute: false,
				namesAsk: true,
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a verified cite into a poor block -> its claim is flagged quality poor in verdict.json and in --json',
		async () => {
			const packed = await packedForVerdict({ standards: POOR_BLOCK_STANDARDS })
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const json = await verdictedJson({ packed, files, exitCode: 0 })

			const poor = { claims: [{ verified: true, quality: 'poor' }] }
			expect({
				json: json.reports,
				record: (readVerdictRecord({ packed, round: ROUND_ONE }) as { reports: unknown[] }).reports,
			}).toMatchObject({ json: [poor, poor], record: [poor, poor] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--json gives the reason of the state: null once answered, the outcome reason for a person',
		async () => {
			const answered = await packedForVerdict()
			const person = await packedForVerdict({ argv: ['--effort', 'low'] })

			const agreed = await verdictedJson({
				packed: answered,
				files: reportFilesOf({
					packed: answered,
					reports: agreeingReportsOf({ packed: answered }),
				}),
				exitCode: 0,
			})
			const differing = await verdictedJson({
				packed: person,
				files: reportFilesOf({
					packed: person,
					reports: [
						reportOf({ packed: person, letter: 'A', clause: 'first', answer: ANSWER_LONG_TEXT }),
						reportOf({ packed: person, letter: 'B', clause: 'second' }),
					],
				}),
				exitCode: 1,
			})

			expect({
				answered: (agreed as { reason?: unknown }).reason,
				person: (differing as { reason?: unknown }).reason,
				recorded: (
					readVerdictRecord({ packed: person, round: ROUND_ONE }) as {
						outcome: { reason: string }
					}
				).outcome.reason,
			}).toEqual({
				answered: null,
				person: expect.stringMatching(/\S/u),
				recorded: expect.stringMatching(/\S/u),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict and ask answer write their events', () => {
	/** The events of one kind in the ask folder's events file. */
	function eventsOfKind(params: { asksFolder: string; kind: string }) {
		return readEventsFile(eventsPathIn(params.asksFolder)).filter(
			(event) => event.kind === params.kind,
		)
	}

	it(
		'an agreed round -> an ask.verdict event (ask, round, state, accepted 2, refused none, no conflict, no adjudicator) and an ask.fact event (ask, fact, rung 4), no text of the readers',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed, files, exitCode: 0 })

			const verdicts = eventsOfKind({ asksFolder: packed.asksFolder, kind: 'ask.verdict' })
			const facts = eventsOfKind({ asksFolder: packed.asksFolder, kind: 'ask.fact' }).filter(
				(event) => event.rung === 4,
			)
			expect({ verdicts, facts }).toMatchObject({
				verdicts: [
					{
						ask: packed.ask,
						round: 1,
						state: 'answered',
						accepted: 2,
						refused: {},
						polarityConflicts: 0,
						adjudicator: false,
					},
				],
				facts: [{ ask: packed.ask, hit: null, candidates: 0, new: FIRST_FACT, stale: 0, rung: 4 }],
			})
			const text = JSON.stringify([...verdicts, ...facts])
			expect(
				[ANSWER_LONG_TEXT, ANSWER_SHORT_TEXT, FIRST_CLAUSE_SENTENCE].map((part) =>
					text.includes(part),
				),
			).toEqual([false, false, false])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a report refused for a nonce already claimed -> the ask.verdict event counts it by reason: refused { nonce: 1 }, accepted 1',
		async () => {
			const packed = await packedForVerdict()
			const [reportA] = agreeingReportsOf({ packed })
			claimNonceOf({ packed, nonce: reportA?.nonce ?? '' })
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed, files, exitCode: 1 })

			expect(eventsOfKind({ asksFolder: packed.asksFolder, kind: 'ask.verdict' })).toMatchObject([
				{ accepted: 1, refused: { nonce: 1 }, state: 'needs-person' },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'ask answer -> an ask.state event: the ask answered at rung 6',
		async () => {
			const asked = await askedPersonOnly({ documents: true })

			await personAnsweredJson({ asked, exitCode: 0 })

			expect(
				eventsOfKind({ asksFolder: asked.asksFolder, kind: 'ask.state' }).at(-1),
			).toMatchObject({ ask: asked.ask, state: 'answered', rung: 6 })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
