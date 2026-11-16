import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { eventsPathIn, namesIn, readEventsFile } from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import {
	ROUND_ONE,
	ROUND_TWO,
	ROUNDS_FOLDER,
	UNKNOWN_ASK,
	VERDICT_FILE,
} from '../../test/ask-pack-fixtures.constants.ts'
import { readRoundFile, roundFolderOf } from '../../test/ask-pack-fixtures.ts'
import { QUOTE_SEVEN_WORDS_ABSENT } from '../../test/ask-report-fixtures.constants.ts'
import {
	ADJUDICATOR_BRIEF_JSON,
	ADJUDICATOR_BRIEF_MARKDOWN,
	ANSWER_LONG_TEXT,
	ANSWER_SHORT_TEXT,
	DECISION_AGREED_VALUE,
	DECISION_BOUNDED_VALUE,
	DECISION_QUESTION,
	DECISION_REJECTED_ITEM,
	FIRST_FACT,
	USED_FOLDER,
	VERDICT_JSON_KEYS,
} from '../../test/ask-verdict-fixtures.constants.ts'
import {
	adjudicatorReportOf,
	agreeingReportsOf,
	anglesOfClauses,
	claimNonceOf,
	packedForAdjudicator,
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
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

describe('ask verdict: an agreed round is recorded as a fact (behaviour 9)', () => {
	it(
		'two reports that agree at medium -> exit 0, state answered, the fact named, no conflict, nothing next',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const json = await verdictedJson({ packed, files, exitCode: 0 })

			expect(json).toMatchObject({
				schema: 1,
				ask: packed.ask,
				round: 1,
				state: 'answered',
				fact: FIRST_FACT,
				conflict: null,
				next: null,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the fact: a standard fact holding the union of the verified cites and the shortest agreeing answer',
		async () => {
			const packed = await packedForVerdict()
			const reports = agreeingReportsOf({ packed })
			const files = reportFilesOf({ packed, reports })

			await verdictedWith({ packed, files, exitCode: 0 })

			expect(
				readFactFile({
					folder: workspaceFactsFolder({ workspace: packed.workspace }),
					id: FIRST_FACT,
				}),
			).toMatchObject({
				source: 'standard',
				effort: 'medium',
				answer: { verdict: 'yes', value: null, text: ANSWER_SHORT_TEXT },
				evidence: reports.flatMap((report) => report.claims.flatMap((claim) => claim.cites)),
				by: { rung: 4, readers: 2, rounds: 1, adjudicator: false, person: null },
				sources: [expect.objectContaining({ kind: 'standard' })],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the longer answer is not the one kept: the fact holds the shorter of the two agreeing answers',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed, files, exitCode: 0 })

			expect(
				JSON.stringify(
					readFactFile({
						folder: workspaceFactsFolder({ workspace: packed.workspace }),
						id: FIRST_FACT,
					}),
				),
			).not.toContain(ANSWER_LONG_TEXT)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the round closes with a verdict.json: its outcome, the state, the fact and one entry per accepted report',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed, files, exitCode: 0 })

			expect(readVerdictRecord({ packed, round: ROUND_ONE })).toMatchObject({
				schema: 1,
				ask: packed.ask,
				round: 1,
				adjudicator: false,
				outcome: { state: 'answered', agreed: { verdict: 'yes', letters: ['A', 'B'] } },
				state: 'answered',
				fact: FIRST_FACT,
				reports: [
					{ letter: 'A', accepted: true },
					{ letter: 'B', accepted: true },
				],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the ask writes its state: an ask.state event naming the ask and the state answered',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed, files, exitCode: 0 })

			expect(
				readEventsFile(eventsPathIn(packed.asksFolder))
					.filter((event) => event.kind === 'ask.state')
					.map((event) => ({ ask: event.ask, state: event.state }))
					.at(-1),
			).toEqual({ ask: packed.ask, state: 'answered' })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--json prints schema 1 and exactly the documented members, sorted',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const json = await verdictedJson({ packed, files, exitCode: 0 })

			expect(Object.keys(json).sort()).toEqual([...VERDICT_JSON_KEYS])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a --decision ask whose agreed answer names what the definition rejects -> exit 0, the answer held inside the boundary and the conflict flagged',
		async () => {
			const packed = await packedForVerdict({
				question: DECISION_QUESTION,
				argv: ['--decision'],
			})
			const files = reportFilesOf({
				packed,
				reports: agreeingReportsOf({ packed, verdict: 'value', value: DECISION_AGREED_VALUE }),
			})

			const json = await verdictedJson({ packed, files, exitCode: 0 })

			expect({
				state: json.state,
				conflict: json.conflict,
				recorded: readFactFile({
					folder: workspaceFactsFolder({ workspace: packed.workspace }),
					id: FIRST_FACT,
				}).answer.value,
			}).toEqual({
				state: 'answered',
				conflict: {
					kind: 'standard-vs-xsd',
					fact: FIRST_FACT,
					outside: [DECISION_REJECTED_ITEM],
				},
				recorded: DECISION_BOUNDED_VALUE,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: the exit code says what comes next (behaviour 10)', () => {
	it(
		'every report refused by its schema -> exit 2 and nothing recorded: no verdict, no nonce claimed, no fact',
		async () => {
			const packed = await packedForVerdict()
			const files = (['A', 'B'] as const).map((letter) =>
				reportFileOf({ packed, name: `broken-${letter}`, report: { ask: packed.ask } }),
			)
			const before = namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE }))

			await verdictedWith({ packed, files, exitCode: 2 })

			expect({
				round: namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE })),
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toEqual({ round: before, facts: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'two reports citing different clauses at medium, both readers given every slice -> exit 1, nothing left to give: needs-person, the answer command named, the round closed',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', clause: 'first', answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', clause: 'second' }),
				],
			})

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			expect({
				json,
				verdict: readVerdictRecord({ packed, round: ROUND_ONE }),
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toMatchObject({
				json: {
					state: 'needs-person',
					fact: null,
					next: `dialecte ask answer ${packed.ask} "<answer>" --by <who>`,
				},
				verdict: {
					outcome: { state: 'needs-person' },
					state: 'needs-person',
					fact: null,
				},
				facts: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the verdict records the angles of the first clause its verified cites came from (both readers cite it and disagree); that only the angles of cited slices count is pinned in verified-angles-of.test.ts (D39)',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', verdict: 'depends', value: 'when it is listed' }),
				],
			})
			await verdictedWith({ packed, files, exitCode: 1 })

			const { verifiedAngles } = readVerdictRecord({ packed, round: ROUND_ONE }) as {
				verifiedAngles: string[]
			}
			const first = anglesOfClauses({ packed, clauses: ['first'] })

			expect({ named: first.length > 0, angles: [...verifiedAngles].sort() }).toEqual({
				named: true,
				angles: first,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the same disagreement at low -> exit 1, the person next: needs-person and the answer command named',
		async () => {
			const packed = await packedForVerdict({ argv: ['--effort', 'low'] })
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', clause: 'first', answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', clause: 'second' }),
				],
			})

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			expect(json).toMatchObject({
				state: 'needs-person',
				fact: null,
				next: `dialecte ask answer ${packed.ask} "<answer>" --by <who>`,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a polarity conflict at high -> exit 3, the adjudicator next: needs-adjudicator, and ask pack (which writes the adjudicator brief) named',
		async () => {
			const packed = await packedForVerdict({ argv: ['--effort', 'high'] })
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', claimText: 'AA_1 shall not hold AAA_1' }),
					reportOf({ packed, letter: 'B', answer: ANSWER_LONG_TEXT }),
					readerCReportOf({ packed }),
				],
			})

			const json = await verdictedJson({ packed, files, exitCode: 3 })

			expect(json).toMatchObject({
				state: 'needs-adjudicator',
				fact: null,
				next: `dialecte ask pack ${packed.ask}`,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a report that names another ask (K3-a) -> exit 2, nothing recorded: no verdict, no nonce claimed, no fact',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({
				packed,
				reports: agreeingReportsOf({ packed }).map((report) => ({ ...report, ask: UNKNOWN_ASK })),
			})
			const before = namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE }))

			await verdictedWith({ packed, files, exitCode: 2 })

			expect({
				round: namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE })),
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toEqual({ round: before, facts: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'one report naming another ask and one valid (K3-a) -> the first listed refused wrong-ask and never counted, its nonce not claimed',
		async () => {
			const packed = await packedForVerdict()
			const [reportA, reportB] = agreeingReportsOf({ packed })
			const files = reportFilesOf({
				packed,
				reports: [{ ...reportA, ask: UNKNOWN_ASK }, reportB],
			})

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			expect({
				state: json.state,
				reports: json.reports,
				used: namesIn(join(roundFolderOf({ asked: packed, round: ROUND_ONE }), USED_FOLDER)),
			}).toMatchObject({
				state: 'needs-person',
				reports: [
					{ accepted: false, refused: 'wrong-ask' },
					{ letter: 'B', accepted: true },
				],
				used: [reportB.nonce],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'reports of a round already closed (K3-a) -> exit 2 and the closed verdict left as it was',
		async () => {
			const packed = await packedForVerdict()
			const [reportA, reportB] = agreeingReportsOf({ packed })
			const [fileA, fileB] = reportFilesOf({ packed, reports: [reportA, reportB] })
			// B's file names another ask (refused, nothing claimed): A alone cannot answer, so the round closes (exit 1)
			const fileBOfAnotherAsk = reportFileOf({
				packed,
				name: 'report-B-of-another-ask',
				report: { ...reportB, ask: UNKNOWN_ASK },
			})
			await verdictedWith({ packed, files: [fileA, fileBOfAnotherAsk], exitCode: 1 })
			const verdictPath = join(roundFolderOf({ asked: packed, round: ROUND_ONE }), VERDICT_FILE)
			const closed = readFileSync(verdictPath, 'utf8')

			// B's nonce was never claimed: only the closed round can refuse it
			const answer = await verdictedWith({ packed, files: [fileB], exitCode: 2 })

			expect({
				verdict: readFileSync(verdictPath, 'utf8'),
				rounds: namesIn(join(packed.asksFolder, packed.ask, ROUNDS_FOLDER)),
				used: namesIn(join(roundFolderOf({ asked: packed, round: ROUND_ONE }), USED_FOLDER)),
				says: answer.output,
			}).toEqual({
				verdict: closed,
				rounds: [ROUND_ONE],
				used: [reportA.nonce],
				says: expect.stringMatching(/round 1.*closed|closed.*round 1/su),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask already answered (K3-b) -> exit 2 and the fact left as it was: one fact file, the same text',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })
			await verdictedWith({ packed, files, exitCode: 0 })
			const folder = workspaceFactsFolder({ workspace: packed.workspace })
			const factPath = join(folder, `${FIRST_FACT}.json`)
			const recorded = { names: namesIn(folder), text: readFileSync(factPath, 'utf8') }

			await verdictedWith({ packed, files, exitCode: 2 })

			expect({ names: namesIn(folder), text: readFileSync(factPath, 'utf8') }).toEqual(recorded)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a nonce already claimed by an earlier run -> that report is refused nonce and not counted: the other reader alone cannot answer',
		async () => {
			const packed = await packedForVerdict()
			const [reportA, reportB] = agreeingReportsOf({ packed })
			claimNonceOf({ packed, nonce: reportA.nonce })
			const files = reportFilesOf({ packed, reports: [reportA, reportB] })

			const json = await verdictedJson({ packed, files, exitCode: 1 })

			expect({
				state: json.state,
				refused: json.reports.filter((report) => report.accepted === false),
				fact: json.fact,
			}).toMatchObject({
				state: 'needs-person',
				refused: [{ refused: 'nonce' }],
				fact: null,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'every accepted nonce is claimed by a file below the round used folder',
		async () => {
			const packed = await packedForVerdict()
			const reports = agreeingReportsOf({ packed })
			const files = reportFilesOf({ packed, reports })

			await verdictedWith({ packed, files, exitCode: 0 })

			expect(
				namesIn(join(roundFolderOf({ asked: packed, round: ROUND_ONE }), USED_FOLDER)),
			).toEqual(reports.map((report) => report.nonce).sort())
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an unknown ask -> exit 2',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			await verdictedWith({ packed: { ...packed, ask: UNKNOWN_ASK }, files, exitCode: 2 })

			expect(existsSync(join(packed.asksFolder, UNKNOWN_ASK))).toBe(false)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no report file given -> exit 2, nothing recorded',
		async () => {
			const packed = await packedForVerdict()

			await verdictedWith({ packed, files: [], exitCode: 2 })

			expect(namesIn(workspaceFactsFolder({ workspace: packed.workspace }))).toEqual([])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask pack and ask verdict --adjudicator: the adjudicator settles a high ask the readers could not (case 33)', () => {
	it(
		'ask pack on a needs-adjudicator ask -> the next round folder holds the adjudicator brief: its nonce, the accepted reports with their check results, the union of the cited ranges',
		async () => {
			const { packed, round, nonce } = await packedForAdjudicator()

			expect({
				round,
				nonce: nonce.length > 0,
				folder: namesIn(roundFolderOf({ asked: packed, round: ROUND_TWO })),
				brief: readRoundFile({ asked: packed, round: ROUND_TWO, name: ADJUDICATOR_BRIEF_JSON }),
			}).toMatchObject({
				round: 2,
				nonce: true,
				folder: expect.arrayContaining([ADJUDICATOR_BRIEF_JSON, ADJUDICATOR_BRIEF_MARKDOWN]),
				brief: {
					schema: 1,
					ask: packed.ask,
					round: 2,
					reader: 'adjudicator',
					reports: [
						{ letter: 'A', claims: [{ polarityConflict: true }] },
						{ letter: 'B', claims: [{ polarityConflict: false }] },
						{ letter: 'C', claims: [] },
					],
					ranges: expect.arrayContaining([
						expect.objectContaining({
							file: expect.any(String),
							from: expect.any(Number),
							to: expect.any(Number),
						}),
					]),
				},
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the adjudicator report accepted with a verified claim -> exit 0, a fact recorded by the adjudicator (adjudicator: true), the closing verdict marked adjudicator',
		async () => {
			const { packed, round, nonce } = await packedForAdjudicator()
			const [file] = reportFilesOf({
				packed,
				reports: [adjudicatorReportOf({ packed, round, nonce })],
			})

			const json = await verdictedJson({
				packed,
				files: [file],
				argv: ['--adjudicator'],
				exitCode: 0,
			})

			expect({
				json,
				fact: readFactFile({
					folder: workspaceFactsFolder({ workspace: packed.workspace }),
					id: FIRST_FACT,
				}),
				verdict: readVerdictRecord({ packed, round: ROUND_TWO }),
			}).toMatchObject({
				json: { state: 'answered', round: 2, fact: FIRST_FACT },
				fact: {
					source: 'standard',
					effort: 'high',
					answer: { verdict: 'yes', text: ANSWER_LONG_TEXT },
					by: { rung: 5, rounds: 1, adjudicator: true, person: null },
				},
				verdict: { adjudicator: true, outcome: { state: 'answered' }, fact: FIRST_FACT },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the adjudicator report whose cite is refused -> exit 1, the person next, no fact',
		async () => {
			const { packed, round, nonce } = await packedForAdjudicator()
			const [file] = reportFilesOf({
				packed,
				reports: [adjudicatorReportOf({ packed, round, nonce, quote: QUOTE_SEVEN_WORDS_ABSENT })],
			})

			const json = await verdictedJson({
				packed,
				files: [file],
				argv: ['--adjudicator'],
				exitCode: 1,
			})

			expect({
				state: json.state,
				fact: json.fact,
				next: json.next,
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toEqual({
				state: 'needs-person',
				fact: null,
				next: `dialecte ask answer ${packed.ask} "<answer>" --by <who>`,
				facts: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the adjudicator report is checked against the ranges of its brief: it cites the second clause, the readers cited the first -> refused not-given, exit 1, no fact',
		async () => {
			const { packed, round, nonce } = await packedForAdjudicator()
			const [file] = reportFilesOf({
				packed,
				reports: [adjudicatorReportOf({ packed, round, nonce, clause: 'second' })],
			})

			const json = await verdictedJson({
				packed,
				files: [file],
				argv: ['--adjudicator'],
				exitCode: 1,
			})

			expect({
				state: json.state,
				reports: json.reports,
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toMatchObject({
				state: 'needs-person',
				reports: [
					{
						accepted: false,
						faults: expect.arrayContaining([expect.stringContaining('not-given')]),
					},
				],
				facts: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--adjudicator on an ask that is not waiting for the adjudicator -> exit 2, nothing recorded',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })
			const before = namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE }))

			await verdictedWith({ packed, files, argv: ['--adjudicator'], exitCode: 2 })

			expect({
				round: namesIn(roundFolderOf({ asked: packed, round: ROUND_ONE })),
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toEqual({ round: before, facts: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the adjudicator report sent without --adjudicator -> refused, exit 2, nothing recorded: no fact, no verdict for the adjudicator round',
		async () => {
			const { packed, round, nonce } = await packedForAdjudicator()
			const [file] = reportFilesOf({
				packed,
				reports: [adjudicatorReportOf({ packed, round, nonce })],
			})

			await verdictedWith({ packed, files: [file], exitCode: 2 })

			expect({
				round: namesIn(roundFolderOf({ asked: packed, round: ROUND_TWO })),
				facts: namesIn(workspaceFactsFolder({ workspace: packed.workspace })),
			}).toEqual({
				round: [ADJUDICATOR_BRIEF_JSON, ADJUDICATOR_BRIEF_MARKDOWN],
				facts: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
