/**
 * The verbs of a lot's review rounds that write in its hand-over folder, run by `dialecte lot`:
 * `lot finding <id|folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>`,
 * `lot decide <id|folder> <finding> <state...>`, `lot snapshot <id|folder> --round <n> [--beyond-cap --by <who>
 * --reason <text>]`: the findings ledger and the per-round snapshots, a round above the cap only with its go-ahead
 * row in `decisions.md`; `lot choice <id|folder> --by <who> <decision>`: a decision made outside the ledger, in
 * its `decisions.md`; `lot standard <id|folder> consulted <note> | not-consulted <reason>`: the standard check.
 * `runRecordVerb` runs one by its `lot` verb; `runRecord` takes it under the old word the table of the renamed
 * forms gives it.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { appendDecision, dayOf } from '../lib/review-rounds/decisions-file.ts'
import {
	appendFinding,
	findLedgerTable,
	parseDecision,
	replaceStateCell,
} from '../lib/review-rounds/findings-ledger.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { recordVerbOfWord, verbPrefix } from '../lib/review-rounds/review-round-verbs.ts'
import {
	BEYOND_CAP_DECISION,
	BEYOND_CAP_FLAG,
	BEYOND_CAP_REFUSAL,
	CAP_SOURCE_EFFORT,
	CAP_SOURCE_EFFORT_CLASS,
	CHOICE_OPTIONS,
	DECISIONS_FILE,
	NO_EFFORT_CAP_REFUSAL,
	LEDGER_FILE,
	LINE_BREAK_PATTERN,
	CHOICE_USAGE,
	DECIDE_USAGE,
	FINDING_OPTIONS,
	FINDING_USAGE,
	RISK_RAISED_LINE,
	RISK_RAISED_REASON,
	SEVERITY_SPELLINGS,
	SNAPSHOT_OPTIONS,
	SNAPSHOT_USAGE,
	WITHIN_CAP_REFUSAL,
} from '../lib/review-rounds/review-rounds.constants.ts'
import { parseRound, readArguments } from '../lib/review-rounds/round-arguments.ts'
import { snapshotRefusal, takeSnapshot } from '../lib/review-rounds/snapshot-round.ts'
import {
	handoverFolderRefusal,
	readWorktreeState,
	workTreeTopOf,
} from '../lib/review-rounds/worktree-state.ts'
import { appendDerivedRiskLine, tryDeriveLotRiskClass } from '../lib/risk/derive-lot-risk-class.ts'
import { riskReasonText } from '../lib/risk/risk-reason.ts'
import { isEffortBelow, riskCapOf } from '../lib/risk/risk-records.ts'
import { recordStandard } from '../lib/standard/record-standard.ts'
import { replaceWhole } from '../lib/store/publish.ts'
import { readBeyondCapRows } from '../lib/store/station-records.ts'

import type { RecordVerb } from '../lib/command-map/command-map.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { RoundArguments, SnapshotGoAhead } from '../lib/review-rounds/review-rounds.types.ts'
import type { Effort, RiskCap, RiskDerivation } from '../lib/risk/risk.types.ts'
import type { TemporaryFileSeam } from '../lib/store/store.types.ts'

/** A review rounds' verb under its old word (`runRecord({ argv: [<old word>, ...] })`). */
export function runRecord(params: { cwd: string; argv: string[]; now?: Date }): CommandResult {
	const [word, ...argv] = params.argv
	const verb = recordVerbOfWord(word)
	if (!verb) return { exitCode: 2, output: renderLotUsage() }
	return runRecordVerb({ verb, cwd: params.cwd, argv, now: params.now })
}

/** A review rounds' verb that writes in the hand-over folder, by its `lot` verb. */
export function runRecordVerb(params: {
	verb: RecordVerb
	cwd: string
	argv: string[]
	now?: Date
	/** Called once the written file's temporary file is written and before it replaces the file. */
	afterTemporaryWritten?: TemporaryFileSeam
}): CommandResult {
	const { verb, cwd, argv, now, afterTemporaryWritten } = params
	try {
		if (verb === 'choice') return recordChoice({ cwd, argv, now, afterTemporaryWritten })
		if (verb === 'finding') return recordFinding({ cwd, argv, afterTemporaryWritten })
		if (verb === 'decide') return recordDecision({ cwd, argv, afterTemporaryWritten })
		if (verb === 'snapshot') return recordSnapshot({ cwd, argv, now, afterTemporaryWritten })
		return recordStandard({ cwd, argv, now, afterTemporaryWritten })
	} catch (error) {
		return answerOf({ exitCode: 1, line: `${verbPrefix(verb)}: ${(error as Error).message}` })
	}
}

/** A result of one line. */
function answerOf(params: { exitCode: number; line: string }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: [params.line] })
}

function recordChoice(params: {
	cwd: string
	argv: string[]
	now?: Date
	afterTemporaryWritten?: TemporaryFileSeam
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: CHOICE_OPTIONS })
	if (typeof read === 'string') return answerOf({ exitCode: 2, line: `${CHOICE_USAGE} (${read})` })
	const [folderWord, decision] = read.words
	const by = read.values.get('by') ?? ''
	if (read.words.length !== 2 || !by.trim() || !decision?.trim())
		return answerOf({ exitCode: 2, line: CHOICE_USAGE })
	if (LINE_BREAK_PATTERN.test(by) || LINE_BREAK_PATTERN.test(decision))
		return answerOf({
			exitCode: 2,
			line: `${CHOICE_USAGE} (the decision and --by are one line each)`,
		})
	const folder = resolve(params.cwd, folderWord)
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return answerOf({ exitCode: 1, line: `${verbPrefix('choice')}: ${refusal}` })
	mkdirSync(folder, { recursive: true })
	const path = join(folder, DECISIONS_FILE)
	appendDecision({
		path,
		title: basename(folder),
		decision,
		by,
		when: dayOf(params.now ?? new Date()),
		afterTemporaryWritten: params.afterTemporaryWritten,
	})
	return answerOf({ exitCode: 0, line: `${verbPrefix('choice')}: by ${by} - ${path}` })
}

function recordFinding(params: {
	cwd: string
	argv: string[]
	afterTemporaryWritten?: TemporaryFileSeam
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: FINDING_OPTIONS })
	if (typeof read === 'string') return answerOf({ exitCode: 2, line: `${FINDING_USAGE} (${read})` })
	const usage = answerOf({ exitCode: 2, line: FINDING_USAGE })
	const { words, values } = read
	const round = parseRound(values.get('round'))
	const severityWord = values.get('severity') ?? ''
	const severity = Object.hasOwn(SEVERITY_SPELLINGS, severityWord)
		? SEVERITY_SPELLINGS[severityWord]
		: undefined
	const at = values.get('at') ?? ''
	const finding = words[1] ?? ''
	if (words.length !== 2 || round === undefined || severity === undefined) return usage
	if (!finding || !at || LINE_BREAK_PATTERN.test(finding) || LINE_BREAK_PATTERN.test(at))
		return answerOf({
			exitCode: 2,
			line: `${FINDING_USAGE} (the finding and --at are one non-empty line each)`,
		})
	const folder = resolve(params.cwd, words[0])
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return answerOf({ exitCode: 1, line: `${verbPrefix('finding')}: ${refusal}` })
	mkdirSync(folder, { recursive: true })
	const ledger = join(folder, LEDGER_FILE)
	const id = appendFinding({
		path: ledger,
		title: basename(folder),
		round,
		severity,
		at,
		finding,
		afterTemporaryWritten: params.afterTemporaryWritten,
	})
	return answerOf({ exitCode: 0, line: `${verbPrefix('finding')}: ${id} open - ${ledger}` })
}

function recordDecision(params: {
	cwd: string
	argv: string[]
	afterTemporaryWritten?: TemporaryFileSeam
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [] })
	if (typeof read === 'string') return answerOf({ exitCode: 2, line: `${DECIDE_USAGE} (${read})` })
	const [folderWord, id, ...stateWords] = read.words
	if (!folderWord || !id || stateWords.length === 0)
		return answerOf({ exitCode: 2, line: DECIDE_USAGE })
	const decision = parseDecision(stateWords)
	if (typeof decision === 'string')
		return answerOf({ exitCode: 2, line: `${verbPrefix('decide')}: ${decision}` })
	const folder = resolve(params.cwd, folderWord)
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return answerOf({ exitCode: 1, line: `${verbPrefix('decide')}: ${refusal}` })
	const ledger = join(folder, LEDGER_FILE)
	if (!existsSync(ledger))
		return answerOf({
			exitCode: 1,
			line: `${verbPrefix('decide')}: no findings ledger ${ledger}: lot finding writes the first finding`,
		})
	const lines = readFileSync(ledger, 'utf8').split('\n')
	const rows = findLedgerTable(lines)?.rows ?? []
	const row = rows.find((candidate) => candidate.id === id)
	if (!row)
		return answerOf({
			exitCode: 1,
			line: `${verbPrefix('decide')}: unknown finding id ${id}; the ledger holds ${rows.map((known) => known.id).join(', ') || 'no finding'}`,
		})
	if (
		decision.fixedRound !== undefined &&
		row.round !== undefined &&
		decision.fixedRound <= row.round
	)
		return answerOf({
			exitCode: 2,
			line: `${verbPrefix('decide')}: ${id} was raised in round ${row.round}: the round that verified its fix comes after it`,
		})
	lines[row.line] = replaceStateCell({ line: lines[row.line], written: decision.written })
	replaceWhole({
		path: ledger,
		text: lines.join('\n'),
		afterTemporaryWritten: params.afterTemporaryWritten,
	})
	return answerOf({
		exitCode: 0,
		line: `${verbPrefix('decide')}: ${id} ${decision.written} - ${ledger}`,
	})
}

function recordSnapshot(params: {
	cwd: string
	argv: string[]
	now?: Date
	afterTemporaryWritten?: TemporaryFileSeam
}): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: SNAPSHOT_OPTIONS,
		flags: [BEYOND_CAP_FLAG],
	})
	if (typeof read === 'string')
		return answerOf({ exitCode: 2, line: `${SNAPSHOT_USAGE} (${read})` })
	const round = parseRound(read.values.get('round'))
	const goAhead = goAheadOf(read)
	if (read.words.length !== 1 || round === undefined || goAhead === 'usage')
		return answerOf({ exitCode: 2, line: SNAPSHOT_USAGE })
	const root = workTreeTopOf(params.cwd)
	if (!root)
		return answerOf({
			exitCode: 1,
			line: `${verbPrefix('snapshot')}: ${params.cwd} is in no git work tree: run lot snapshot inside the lot's worktree`,
		})
	const folder = resolve(params.cwd, read.words[0])
	const folderRefusal = handoverFolderRefusal(folder)
	if (folderRefusal)
		return answerOf({ exitCode: 1, line: `${verbPrefix('snapshot')}: ${folderRefusal}` })
	const state = readWorktreeState(root)
	const refusal = snapshotRefusal({ root, folder, round, state })
	if (refusal) return answerOf({ exitCode: 1, line: `${verbPrefix('snapshot')}: ${refusal}` })
	const now = params.now ?? new Date()
	// derived before the cap check, appended only once every refusal is passed: a raised class raises the cap of this
	// call (D7), a refused call writes nothing (D30)
	const { derivation, warning } = tryDeriveLotRiskClass({ folder, cwd: params.cwd })
	const riskCap = riskCapOf({ folder, derivedNow: derivation?.class })
	const { cap, effort } = riskCap
	const capRefusal = roundCapRefusal({ folder, round, riskCap, goAhead })
	if (capRefusal) return answerOf({ exitCode: 2, line: capRefusal })
	const wordRefusal = goAheadWordRefusal({ root, goAhead })
	if (wordRefusal) return answerOf({ exitCode: 2, line: wordRefusal })
	if (derivation !== undefined) appendDerivedRiskLine({ folder, derivation, now, from: 'snapshot' })
	if (goAhead) {
		writeGoAhead({
			folder,
			round,
			cap,
			goAhead,
			now,
			afterTemporaryWritten: params.afterTemporaryWritten,
		})
	}
	const taken = takeSnapshot({ root, folder, round, state, at: now })
	const raised = raisedLineOf({ derivation, effort, cap })
	return resultOf({
		exitCode: 0,
		lines: [
			`${verbPrefix('snapshot')}: round-${round} - ${taken.copied} copied, ${taken.deleted} deleted, base ${taken.base.slice(0, 12)} - ${folder}`,
			...(raised === undefined ? [] : [raised]),
			...(warning === undefined ? [] : [warning]),
		],
	})
}

/**
 * The `!` line of a snapshot whose class derived now is above the effort's: the class, its first reason and the cap
 * (33L1 D7); undefined when nothing was derived, no effort is recorded or the class is not above it.
 */
function raisedLineOf(params: {
	derivation: RiskDerivation | undefined
	effort: Effort | undefined
	cap: number
}): string | undefined {
	const { derivation, effort } = params
	if (derivation === undefined || effort === undefined) return undefined
	if (!isEffortBelow({ effort, riskClass: derivation.class })) return undefined
	const [first] = derivation.reasons
	return fillMessage({
		template: RISK_RAISED_LINE,
		values: {
			class: derivation.class,
			reason:
				first === undefined
					? ''
					: fillMessage({
							template: RISK_RAISED_REASON,
							values: { reason: riskReasonText(first) },
						}),
			cap: String(params.cap),
		},
	})
}

/**
 * The go-ahead of `lot snapshot` for a round above the cap: `--beyond-cap` with `--by` and `--reason`, each one
 * non-empty line; undefined when none of the three is given; `usage` for any other mix (33L1 D17).
 */
function goAheadOf(read: RoundArguments): SnapshotGoAhead | undefined | 'usage' {
	const by = read.values.get('by')
	const reason = read.values.get('reason')
	if (!read.flags.has(BEYOND_CAP_FLAG))
		return by === undefined && reason === undefined ? undefined : 'usage'
	if (!isOneLine(by) || !isOneLine(reason)) return 'usage'
	return { by, reason }
}

/**
 * Why round `round` cannot be taken at the cap `cap`: above it without the go-ahead given nor a go-ahead row of the
 * round standing in `decisions.md` (the retry after a crash between the row and the snapshot, R1-3), or within it
 * with one; undefined when it can.
 */
function roundCapRefusal(params: {
	folder: string
	round: number
	riskCap: RiskCap
	goAhead: SnapshotGoAhead | undefined
}): string | undefined {
	const { round, riskCap } = params
	const { cap, effort } = riskCap
	if (round > cap && !params.goAhead && !hasGoAheadRow({ folder: params.folder, round }))
		return fillMessage({
			template: effort === undefined ? NO_EFFORT_CAP_REFUSAL : BEYOND_CAP_REFUSAL,
			values: {
				round: String(round),
				cap: String(cap),
				capSource: capSourceOf({ riskCap }),
				folder: params.folder,
			},
		})
	if (round <= cap && params.goAhead)
		return fillMessage({
			template: WITHIN_CAP_REFUSAL,
			values: { round: String(round), cap: String(cap) },
		})
	return undefined
}

/** The refusal of a go-ahead whose `--by` or `--reason` holds a forbidden word; undefined without a go-ahead. */
function goAheadWordRefusal(params: {
	root: string
	goAhead: SnapshotGoAhead | undefined
}): string | undefined {
	const { goAhead } = params
	if (goAhead === undefined) return undefined
	return forbiddenWordRefusal({
		root: params.root,
		verb: 'snapshot',
		options: [
			{ option: '--by', text: goAhead.by },
			{ option: '--reason', text: goAhead.reason },
		],
	})
}

/**
 * What set the cap a beyond-cap refusal names (D30): `effort <e>`, or `effort <e>, risk class <c>` when a class above
 * the effort's raised it; empty without an effort (its refusal names none).
 */
function capSourceOf(params: { riskCap: RiskCap }): string {
	const { effort, class: riskClass, raisedBy } = params.riskCap
	if (effort === undefined) return ''
	return fillMessage({
		template: raisedBy === undefined ? CAP_SOURCE_EFFORT : CAP_SOURCE_EFFORT_CLASS,
		values: { effort, class: riskClass ?? '' },
	})
}

/**
 * Appends the go-ahead row `round <n> beyond the cap of <cap>: <reason>` to the folder's `decisions.md`, unless a
 * row of that round stands already (a retry after a crash between the row and the snapshot, 33L1 D22.3).
 */
function writeGoAhead(params: {
	folder: string
	round: number
	cap: number
	goAhead: SnapshotGoAhead
	now: Date
	afterTemporaryWritten?: TemporaryFileSeam
}): void {
	const { folder, round } = params
	if (hasGoAheadRow({ folder, round })) return
	appendDecision({
		path: join(folder, DECISIONS_FILE),
		title: basename(folder),
		decision: fillMessage({
			template: BEYOND_CAP_DECISION,
			values: { round: String(round), cap: String(params.cap), reason: params.goAhead.reason },
		}),
		by: params.goAhead.by,
		when: dayOf(params.now),
		afterTemporaryWritten: params.afterTemporaryWritten,
	})
}

/** Whether a go-ahead row of `round` stands in the folder's `decisions.md`. */
function hasGoAheadRow(params: { folder: string; round: number }): boolean {
	return readBeyondCapRows({ lotFolder: params.folder }).some((row) => row.round === params.round)
}
