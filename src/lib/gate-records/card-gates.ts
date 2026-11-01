/**
 * The hand-over card's gate lines, from records, never from prose: one per gate step (the latest record of
 * each step across the gate's two modes and the commit hook's record, which a newer gate record supersedes
 * whole), then the rules, then the review from the hand-over folder's findings ledger and round snapshots.
 * A record of another tree than the worktree's now is marked stale: it warns, or stays failed.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { counted } from '../counted.ts'
import { findLedgerTable, tableCells } from '../review-rounds/findings-ledger.ts'
import { LEDGER_FILE, SEVERITY_SPELLINGS } from '../review-rounds/review-rounds.constants.ts'
import {
	DETAIL_SEPARATOR,
	GATE_LINE_NAME,
	HOOK_RECORD_DETAIL,
	HOOK_RECORD_MODE,
	MISSING_SCRIPT_DETAIL,
	MISSING_SCRIPT_PATTERN,
	NEVER_RUN_DETAIL,
	NIT_SEVERITY,
	NO_FINDINGS_DETAIL,
	NO_LEDGER_DETAIL,
	NOT_RUN_DETAIL,
	NOT_RUN_HERE_DETAIL,
	OPEN_LEDGER_STATES,
	REVIEW_APPROVED_DETAIL,
	REVIEW_LINE_NAME,
	ROUND_FOLDER_PATTERN,
	RULES_LINE_NAME,
	TREE_CHANGED_SUFFIX,
} from './gate-records.constants.ts'
import { readGateRecords, readRulesRecord } from './gate-records.ts'

import type { StepCounts } from '../gate/gate.types.ts'
import type { CardGateLine, GateRecord, RecordedStep, RulesRecord } from './gate-records.types.ts'

export function buildCardGateLines(params: {
	/** The worktree the records are of. */
	root: string
	/** The hand-over folder: its findings ledger and round snapshots. */
	folder: string
	/** The worktree's tree now (`computeStateHash`): a record of another tree is stale. */
	stateHash: string
}): CardGateLine[] {
	const { stateHash } = params
	return [
		...gateStepLines({ records: readGateRecords(params.root), stateHash }),
		rulesLine({ record: readRulesRecord(params.root), stateHash }),
		reviewLine(params.folder),
	]
}

/** Each step's line from its latest record; `gate never run` when there is no record. */
function gateStepLines(params: { records: GateRecord[]; stateHash: string }): CardGateLine[] {
	if (params.records.length === 0)
		return [{ name: GATE_LINE_NAME, status: 'failed', detail: NEVER_RUN_DETAIL }]
	const latest = new Map<string, { step: RecordedStep; record: GateRecord }>()
	const oldestFirst = currentRecords(params.records).sort((first, second) =>
		first.at.localeCompare(second.at),
	)
	for (const record of oldestFirst)
		for (const step of record.steps) latest.set(step.name, { step, record })
	return [...latest.values()].map(function stepLine(entry) {
		const line = lineOfStep(entry.step)
		return withTreeCheck({
			line: entry.record.mode === HOOK_RECORD_MODE ? fromHook(line) : line,
			current: entry.record.stateHash === params.stateHash,
		})
	})
}

/**
 * The records the card reads: a commit hook's record only when no gate record is newer. The hook names its
 * own scripts (`test:run`, `lint:check`), never the gate's steps, so a later gate run could not replace its
 * lines one by one: it replaces the whole record.
 */
function currentRecords(records: readonly GateRecord[]): GateRecord[] {
	const newestGate = records
		.filter((record) => record.mode !== HOOK_RECORD_MODE)
		.reduce((newest, record) => (record.at > newest ? record.at : newest), '')
	return records.filter((record) => record.mode !== HOOK_RECORD_MODE || record.at > newestGate)
}

/** A line read from a commit hook's record: its detail ends saying so (`✓ test:run  1214/1214 · commit hook`). */
function fromHook(line: CardGateLine): CardGateLine {
	return {
		...line,
		detail: [line.detail, HOOK_RECORD_DETAIL].filter(Boolean).join(DETAIL_SEPARATOR),
	}
}

function lineOfStep(step: RecordedStep): CardGateLine {
	const { name } = step
	if (step.status === 'not-run') return { name, status: 'warning', detail: NOT_RUN_DETAIL }
	if (step.status === 'skipped')
		return {
			name,
			status: 'warning',
			detail: NOT_RUN_HERE_DETAIL.replace('{reason}', shortReason(step.reason ?? '')),
		}
	const counts = renderCardCounts(step.counts)
	if (step.status === 'failed')
		return {
			name,
			status: 'failed',
			detail: [counts, step.reason ?? ''].filter(Boolean).join(DETAIL_SEPARATOR),
		}
	return { name, status: 'passed', detail: counts || (step.note ?? '') }
}

/** A gate reason in a few words: a missing npm script named by itself. */
function shortReason(reason: string): string {
	return reason.replace(MISSING_SCRIPT_PATTERN, MISSING_SCRIPT_DETAIL)
}

/** The counts as the card writes them: `397/397` when every test passed, else each count named. */
function renderCardCounts(counts: StepCounts): string {
	const parts: string[] = []
	if (counts.tests) {
		const { passed, failed, skipped, total } = counts.tests
		if (passed === total) parts.push(`${passed}/${total}`)
		else
			parts.push(
				[`${passed} passed`, failed ? `${failed} failed` : '', skipped ? `${skipped} skipped` : '']
					.filter(Boolean)
					.join(DETAIL_SEPARATOR),
			)
	}
	if (counts.errors !== undefined) parts.push(errorsAndWarnings(counts))
	return parts.join(DETAIL_SEPARATOR)
}

/** `<n> error(s) · <m> warning(s)`, each noun singular at 1. */
function errorsAndWarnings(params: { errors?: number; warnings?: number }): string {
	return [
		counted({ count: params.errors ?? 0, noun: 'error' }),
		counted({ count: params.warnings ?? 0, noun: 'warning' }),
	].join(DETAIL_SEPARATOR)
}

/**
 * A line of a record of another tree: said so after its detail; a failed step stays `✗`, any other line
 * turns `!`.
 */
function withTreeCheck(params: { line: CardGateLine; current: boolean }): CardGateLine {
	const { line } = params
	if (params.current) return line
	return {
		name: line.name,
		status: line.status === 'failed' ? 'failed' : 'warning',
		detail: `${line.detail}${TREE_CHANGED_SUFFIX}`,
		stale: true,
	}
}

function rulesLine(params: { record: RulesRecord | undefined; stateHash: string }): CardGateLine {
	const { record } = params
	if (!record) return { name: RULES_LINE_NAME, status: 'warning', detail: NEVER_RUN_DETAIL }
	return withTreeCheck({
		line: {
			name: RULES_LINE_NAME,
			status: record.errors ? 'failed' : 'passed',
			detail: errorsAndWarnings(record),
		},
		current: record.stateHash === params.stateHash,
	})
}

/**
 * The review from the findings ledger: approved when no row is open, `!` when only nits are or the ledger
 * holds no row yet, `✗` when a blocking or should-fix row is; the rounds are the highest of the rows' and
 * the snapshots'.
 */
function reviewLine(folder: string): CardGateLine {
	const ledgerPath = join(folder, LEDGER_FILE)
	if (!existsSync(ledgerPath))
		return { name: REVIEW_LINE_NAME, status: 'warning', detail: NO_LEDGER_DETAIL }
	const lines = readFileSync(ledgerPath, 'utf8').split('\n')
	const rows = findLedgerTable(lines)?.rows ?? []
	const rounds = Math.max(0, ...rows.map((row) => row.round ?? 0), ...snapshotRounds(folder))
	const openSeverities = rows.flatMap(function openSeverity(row) {
		const cells = tableCells(lines[row.line]) ?? []
		const state = cells.at(-1) ?? ''
		if (!OPEN_LEDGER_STATES.includes(state)) return []
		return [SEVERITY_SPELLINGS[cells[2] ?? ''] ?? cells[2] ?? '']
	})
	const roundsText = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`
	// a ledger made before the reviewer answered approves nothing
	if (rows.length === 0)
		return {
			name: REVIEW_LINE_NAME,
			status: 'warning',
			detail: `${roundsText}${DETAIL_SEPARATOR}${NO_FINDINGS_DETAIL}`,
		}
	const nits = openSeverities.filter((severity) => severity === NIT_SEVERITY).length
	const blocking = openSeverities.length - nits
	if (blocking)
		return {
			name: REVIEW_LINE_NAME,
			status: 'failed',
			detail: `${roundsText}${DETAIL_SEPARATOR}${blocking} open: blocking or should fix`,
		}
	if (nits)
		return {
			name: REVIEW_LINE_NAME,
			status: 'warning',
			detail: `${roundsText}${DETAIL_SEPARATOR}${nits} ${nits === 1 ? 'nit' : 'nits'} open`,
		}
	return {
		name: REVIEW_LINE_NAME,
		status: 'passed',
		detail: `${roundsText}${DETAIL_SEPARATOR}${REVIEW_APPROVED_DETAIL}`,
	}
}

/** The rounds of the `round-<n>/` snapshots in the hand-over folder. */
function snapshotRounds(folder: string): number[] {
	return readdirSync(folder, { withFileTypes: true }).flatMap(function roundOf(entry) {
		const match = ROUND_FOLDER_PATTERN.exec(entry.name)
		return entry.isDirectory() && match ? [Number(match[1])] : []
	})
}
