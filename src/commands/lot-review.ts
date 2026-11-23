/**
 * `dialecte lot review <id> [--no-open]`: the private half of a lot's review (33CI CI7), read-only. Prints what never
 * goes on the change request page - the lot's state and heads, its checks, the brief's goal and steps, its tests record,
 * `decisions.md`, every finding with its text and state, the standard note, and what `lot approve` would refuse - then
 * opens the change request's changed files in the browser, where the code is reviewed (`--no-open` names the page only).
 * `--comments --round <n>` brings the change request's line comments back as findings of round n instead.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { readGit } from '../lib/git.ts'
import { readLanding } from '../lib/handover/land-record.ts'
import { createHost, hostNounsOf } from '../lib/host/select-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { readDecisions } from '../lib/review-rounds/decisions-file.ts'
import { findLedgerTable, tableCells, unescapeCell } from '../lib/review-rounds/findings-ledger.ts'
import { newCommentFindings, recordCommentFindings } from '../lib/review-rounds/review-comments.ts'
import { refreshReviewRecord } from '../lib/review-rounds/review-record.ts'
import { DECISIONS_FILE, LEDGER_FILE } from '../lib/review-rounds/review-rounds.constants.ts'
import { parseRound, readArguments } from '../lib/review-rounds/round-arguments.ts'
import { readStandardLine } from '../lib/standard/read-standard-line.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { readTestsRecord } from '../lib/tdd/tests-record.ts'
import { approvalRefusals } from './lot-approve.ts'
import { resolveLotPlace } from './lot-describe.ts'
import { LOT_REVIEW_FLAGS, LOT_REVIEW_LINES, LOT_REVIEW_OPTIONS } from './lot-review.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	HostAdapter,
	HostNouns,
	ChangeRequest,
	ChangeRequestChecks,
} from '../lib/host/host.types.ts'
import type { LotPlace } from './lot-describe.types.ts'

export function runLotReview(params: {
	cwd: string
	argv: string[]
	/** Where the change request lives; default: the repository's host. */
	host?: HostAdapter
	now?: Date
}): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: LOT_REVIEW_OPTIONS,
		flags: LOT_REVIEW_FLAGS,
	})
	if (typeof read === 'string' || read.words.length !== 1)
		return { exitCode: 2, output: renderLotUsage() }
	const takesComments = read.flags.has('comments')
	const round = parseRound(read.values.get('round'))
	if (takesComments !== read.values.has('round') || (takesComments && round === undefined))
		return { exitCode: 2, output: renderLotUsage() }
	const place = resolveLotPlace({
		cwd: params.cwd,
		id: read.words[0],
		verb: 'review',
		mode: takesComments ? 'write' : 'read',
	})
	if ('exitCode' in place) return place
	const nouns = hostNounsOf({ root: place.worktree })
	if (round !== undefined)
		return takeCommentFindings({
			place,
			round,
			nouns,
			host: params.host,
			now: params.now ?? new Date(),
		})
	const header = fillMessage({
		template: LOT_REVIEW_LINES.header,
		values: { lot: place.lot, state: place.state, branch: place.branch },
	})
	const landing = readLanding({ lotFolder: place.lotFolder })
	const host = params.host ?? createHost()
	const changeRequest =
		landing === undefined
			? undefined
			: host.readChangeRequest({ root: place.worktree, ref: String(landing.number) })
	if (changeRequest !== undefined && 'refusal' in changeRequest)
		return resultOf({ exitCode: 1, lines: [`${LOT_REVIEW_LINES.prefix}${changeRequest.refusal}`] })
	if (landing === undefined || changeRequest === undefined)
		return resultOf({
			exitCode: 0,
			lines: [
				header,
				missingChangeRequestLine({ place, nouns, number: landing?.number }),
				...privateLines(place),
			],
		})
	const checks = host.readChecks({ root: place.worktree, number: changeRequest.number })
	return resultOf({
		exitCode: 0,
		lines: [
			header,
			...changeRequestLines({ place, nouns, changeRequest, landed: landing.head, checks }),
			...privateLines(place),
			'',
			approveLine({ place, changeRequest, landed: landing.head, checks }),
			filesLine({ host, place, changeRequest, open: !read.flags.has('no-open') }),
		],
	})
}

/** Why no change request is shown: the lot never landed (lot land named), or its change request is gone. */
function missingChangeRequestLine(params: {
	place: LotPlace
	nouns: HostNouns
	number: number | undefined
}): string {
	return params.number === undefined
		? fillMessage({
				template: LOT_REVIEW_LINES.noChangeRequest,
				values: { ...params.nouns, lot: params.place.lot },
			})
		: fillMessage({
				template: LOT_REVIEW_LINES.changeRequestGone,
				values: { ...params.nouns, number: String(params.number) },
			})
}

/**
 * `--comments`: the change request's line comments not pulled yet, as findings of `round`; `review.jsonl` written again
 * when one was added.
 */
function takeCommentFindings(params: {
	place: LotPlace
	round: number
	nouns: HostNouns
	host: HostAdapter | undefined
	now: Date
}): CommandResult {
	const { place } = params
	const landing = readLanding({ lotFolder: place.lotFolder })
	if (landing === undefined)
		return resultOf({
			exitCode: 1,
			lines: [
				`${LOT_REVIEW_LINES.prefix}${fillMessage({ template: LOT_REVIEW_LINES.noChangeRequest, values: { ...params.nouns, lot: place.lot } })}`,
			],
		})
	const host = params.host ?? createHost()
	const changeRequest = host.readChangeRequest({
		root: place.worktree,
		ref: String(landing.number),
	})
	if (changeRequest !== undefined && 'refusal' in changeRequest)
		return resultOf({ exitCode: 1, lines: [`${LOT_REVIEW_LINES.prefix}${changeRequest.refusal}`] })
	const number = changeRequest?.number ?? landing.number
	const comments = host.readReviewComments({ root: place.worktree, number })
	if ('refusal' in comments)
		return resultOf({ exitCode: 1, lines: [`${LOT_REVIEW_LINES.prefix}${comments.refusal}`] })
	const findings = newCommentFindings({ folder: place.lotFolder, number, comments })
	if (findings.length === 0)
		return resultOf({
			exitCode: 0,
			lines: [
				fillMessage({
					template: LOT_REVIEW_LINES.pulledNone,
					values: { ...params.nouns, number: String(number) },
				}),
			],
		})
	const recorded = recordCommentFindings({
		folder: place.lotFolder,
		number,
		round: params.round,
		findings,
		now: params.now,
	})
	const { ids } = recorded
	const warning = refreshReviewRecord({ folder: place.lotFolder })
	return resultOf({
		exitCode: recorded.refusal === undefined ? 0 : 1,
		lines: [
			...pulledLinesOf({ findings: findings.slice(0, ids.length), ids }),
			...(recorded.refusal === undefined
				? []
				: [
						fillMessage({
							template: LOT_REVIEW_LINES.commentsCut,
							values: { done: ids.join(', ') || 'none', reason: recorded.refusal },
						}),
					]),
			...(warning === undefined ? [] : [warning]),
		],
	})
}

/** One line per finding a comment became: its id, severity, place and the comment it came from. */
function pulledLinesOf(params: {
	findings: ReturnType<typeof newCommentFindings>
	ids: readonly string[]
}): string[] {
	return params.findings.map(function pulledLine(finding, index) {
		return fillMessage({
			template: LOT_REVIEW_LINES.pulled,
			values: {
				id: params.ids[index],
				severity: finding.severity,
				at: finding.at,
				comment: String(finding.comment),
			},
		})
	})
}

/** The change request's line, the three heads (change request, landed, worktree) and its checks. */
function changeRequestLines(params: {
	place: LotPlace
	nouns: HostNouns
	changeRequest: ChangeRequest
	landed: string
	checks: ChangeRequestChecks | { refusal: string }
}): string[] {
	const { changeRequest, checks } = params
	const head = readGit({ root: params.place.worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const kind =
		changeRequest.state !== 'open'
			? fillMessage({ template: LOT_REVIEW_LINES.notOpen, values: { state: changeRequest.state } })
			: changeRequest.draft
				? LOT_REVIEW_LINES.draft
				: ''
	return [
		fillMessage({
			template: LOT_REVIEW_LINES.changeRequest,
			values: {
				...params.nouns,
				number: String(changeRequest.number),
				draft: kind,
				url: changeRequest.url,
			},
		}),
		fillMessage({
			template: LOT_REVIEW_LINES.heads,
			values: {
				...params.nouns,
				pushed: changeRequest.head.slice(0, SHORT_SHA_LENGTH),
				landed: params.landed.slice(0, SHORT_SHA_LENGTH),
				head: head.slice(0, SHORT_SHA_LENGTH),
			},
		}),
		checksLine(checks),
	]
}

/** The checks' state, with the failing and pending checks named. */
function checksLine(checks: ChangeRequestChecks | { refusal: string }): string {
	if ('refusal' in checks)
		return fillMessage({
			template: LOT_REVIEW_LINES.checksUnread,
			values: { refusal: checks.refusal },
		})
	const names = [...checks.failing, ...checks.pending]
	return fillMessage({
		template: names.length === 0 ? LOT_REVIEW_LINES.checks : LOT_REVIEW_LINES.checksNamed,
		values: { state: checks.state, names: names.join(', ') },
	})
}

/** What never goes on the pull request page: the brief's goal and steps, tests, decisions, findings, standard. */
function privateLines(place: LotPlace): string[] {
	const folder = place.lotFolder
	return [
		'',
		...briefLines(folder),
		'',
		testsLine(folder),
		'',
		LOT_REVIEW_LINES.decisions,
		...orNone(
			readDecisions(join(folder, DECISIONS_FILE)).map((row) =>
				fillMessage({ template: LOT_REVIEW_LINES.decision, values: row }),
			),
		),
		'',
		LOT_REVIEW_LINES.findings,
		...orNone(findingLines(folder)),
		'',
		standardLine(folder),
	]
}

/** The brief's goal, then each step: its title, spec and behaviours; what cannot be read is left out. */
function briefLines(folder: string): string[] {
	const brief = briefOf(folder)
	const goal =
		typeof brief.goal === 'string'
			? fillMessage({ template: LOT_REVIEW_LINES.goal, values: { goal: brief.goal } })
			: LOT_REVIEW_LINES.noGoal
	const steps = Array.isArray(brief.steps) ? brief.steps : []
	return [
		goal,
		...steps.flatMap(function stepLines(step: unknown, index): string[] {
			const fields =
				typeof step === 'object' && step !== null ? (step as Record<string, unknown>) : {}
			const behaviours = Array.isArray(fields.behaviours) ? fields.behaviours : []
			return [
				fillMessage({
					template: LOT_REVIEW_LINES.step,
					values: { number: String(index + 1), title: String(fields.title ?? '') },
				}),
				...(typeof fields.spec === 'string'
					? [fillMessage({ template: LOT_REVIEW_LINES.spec, values: { spec: fields.spec } })]
					: []),
				...behaviours.map((behaviour) =>
					fillMessage({
						template: LOT_REVIEW_LINES.behaviour,
						values: { behaviour: String(behaviour) },
					}),
				),
			]
		}),
	]
}

/** The lot folder's brief as an object; empty when it cannot be read. */
function briefOf(folder: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(folder, STORE_FILES.brief), 'utf8'))
		return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
	} catch {
		return {}
	}
}

/** The tests record's tdd counts and gate run, each `not recorded` when absent. */
function testsLine(folder: string): string {
	const record = readTestsRecord({ folder })
	const counts = Object.entries(record?.tdd?.counts ?? {})
	const tdd =
		record?.tdd === undefined
			? LOT_REVIEW_LINES.noTdd
			: fillMessage({
					template: LOT_REVIEW_LINES.tdd,
					values: {
						cases: String(record.tdd.cases.length),
						counts: counts.map(([status, count]) => `${count} ${status}`).join(', '),
					},
				})
	const gate =
		record?.gate === undefined
			? LOT_REVIEW_LINES.noGate
			: fillMessage({
					template: LOT_REVIEW_LINES.gate,
					values: { mode: record.gate.mode, head: record.gate.head.slice(0, SHORT_SHA_LENGTH) },
				})
	return fillMessage({ template: LOT_REVIEW_LINES.tests, values: { tdd, gate } })
}

/** Each finding of the ledger with its text and state as written. */
function findingLines(folder: string): string[] {
	let text: string
	try {
		text = readFileSync(join(folder, LEDGER_FILE), 'utf8')
	} catch {
		return []
	}
	const lines = text.split('\n')
	return (findLedgerTable(lines)?.rows ?? []).map(function findingLine(row) {
		const [id = '', round = '', severity = '', at = '', ...rest] = (
			tableCells(lines[row.line]) ?? []
		).map(unescapeCell)
		return fillMessage({
			template: LOT_REVIEW_LINES.finding,
			values: {
				id,
				round,
				severity,
				state: rest.at(-1) ?? '',
				at,
				finding: rest.slice(0, -1).join(' | '),
			},
		})
	})
}

/** The card's standard line: whether the standard was consulted, and the note recorded. */
function standardLine(folder: string): string {
	const line = readStandardLine({ folder })
	return fillMessage({
		template: LOT_REVIEW_LINES.standard,
		values: { status: line.status, detail: line.detail ?? '' },
	})
}

/** Whether `lot approve` would approve now, else every refusal it would give. */
function approveLine(params: {
	place: LotPlace
	changeRequest: ChangeRequest
	landed: string
	checks: ChangeRequestChecks | { refusal: string }
}): string {
	const { checks } = params
	const reasons = 'refusal' in checks ? [checks.refusal] : approvalRefusals({ ...params, checks })
	return reasons.length === 0
		? fillMessage({ template: LOT_REVIEW_LINES.approveReady, values: { lot: params.place.lot } })
		: fillMessage({
				template: LOT_REVIEW_LINES.approveRefused,
				values: { reasons: reasons.join('; ') },
			})
}

/** The changed files' page, opened unless `open` is false; a refusal of the opener named, never an exit. */
function filesLine(params: {
	host: HostAdapter
	place: LotPlace
	changeRequest: ChangeRequest
	open: boolean
}): string {
	const { url } = params.changeRequest
	const files = params.changeRequest.filesUrl ?? url
	if (!params.open) return fillMessage({ template: LOT_REVIEW_LINES.files, values: { files } })
	const refused = params.host.openFiles({ root: params.place.worktree, url })
	return refused === undefined
		? fillMessage({ template: LOT_REVIEW_LINES.filesOpened, values: { files } })
		: fillMessage({
				template: LOT_REVIEW_LINES.filesNotOpened,
				values: { files, refusal: refused.refusal },
			})
}

/** The lines, or `none` when there is none. */
function orNone(lines: string[]): string[] {
	return lines.length === 0 ? [LOT_REVIEW_LINES.none] : lines
}
