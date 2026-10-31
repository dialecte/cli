/**
 * `dialecte record review <folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>`,
 * `record decision <folder> <id> <state...>`, `record snapshot <folder> --round <n>`: the findings ledger
 * and the per-round snapshots of a lot's review rounds, in its hand-over folder.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import {
	appendFinding,
	findLedgerTable,
	parseDecision,
	replaceStateCell,
} from '../lib/review-rounds/findings-ledger.ts'
import {
	LEDGER_FILE,
	LINE_BREAK_PATTERN,
	RECORD_DECISION_USAGE,
	RECORD_REVIEW_OPTIONS,
	RECORD_REVIEW_USAGE,
	RECORD_SNAPSHOT_USAGE,
	RECORD_USAGE,
	ROUND_OPTIONS,
	SEVERITY_SPELLINGS,
} from '../lib/review-rounds/review-rounds.constants.ts'
import { parseRound, readArguments } from '../lib/review-rounds/round-arguments.ts'
import { snapshotRefusal, takeSnapshot } from '../lib/review-rounds/snapshot-round.ts'
import {
	handoverFolderRefusal,
	readWorktreeState,
	workTreeTopOf,
} from '../lib/review-rounds/worktree-state.ts'

import type { CommandResult } from '../lib/command-result.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runRecord({ cwd: process.cwd(), argv })
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runRecord(params: { cwd: string; argv: string[] }): CommandResult {
	const [subcommand, ...argv] = params.argv
	try {
		if (subcommand === 'review') return recordReview({ cwd: params.cwd, argv })
		if (subcommand === 'decision') return recordDecision({ cwd: params.cwd, argv })
		if (subcommand === 'snapshot') return recordSnapshot({ cwd: params.cwd, argv })
	} catch (error) {
		return { exitCode: 1, output: `record: ${(error as Error).message}` }
	}
	return { exitCode: 2, output: RECORD_USAGE }
}

function recordReview(params: { cwd: string; argv: string[] }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: RECORD_REVIEW_OPTIONS })
	if (typeof read === 'string') return { exitCode: 2, output: `${RECORD_REVIEW_USAGE} (${read})` }
	const usage = { exitCode: 2, output: RECORD_REVIEW_USAGE }
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
		return {
			exitCode: 2,
			output: `${RECORD_REVIEW_USAGE} (the finding and --at are one non-empty line each)`,
		}
	const folder = resolve(params.cwd, words[0])
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return { exitCode: 1, output: `record: ${refusal}` }
	mkdirSync(folder, { recursive: true })
	const ledger = join(folder, LEDGER_FILE)
	const id = appendFinding({ path: ledger, title: basename(folder), round, severity, at, finding })
	return { exitCode: 0, output: `record: ${id} open - ${ledger}` }
}

function recordDecision(params: { cwd: string; argv: string[] }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [] })
	if (typeof read === 'string') return { exitCode: 2, output: `${RECORD_DECISION_USAGE} (${read})` }
	const [folderWord, id, ...stateWords] = read.words
	if (!folderWord || !id || stateWords.length === 0)
		return { exitCode: 2, output: RECORD_DECISION_USAGE }
	const decision = parseDecision(stateWords)
	if (typeof decision === 'string') return { exitCode: 2, output: `record decision: ${decision}` }
	const folder = resolve(params.cwd, folderWord)
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return { exitCode: 1, output: `record: ${refusal}` }
	const ledger = join(folder, LEDGER_FILE)
	if (!existsSync(ledger))
		return {
			exitCode: 1,
			output: `record: no findings ledger ${ledger}: record review writes the first finding`,
		}
	const lines = readFileSync(ledger, 'utf8').split('\n')
	const rows = findLedgerTable(lines)?.rows ?? []
	const row = rows.find((candidate) => candidate.id === id)
	if (!row)
		return {
			exitCode: 1,
			output: `record: unknown finding id ${id}; the ledger holds ${rows.map((known) => known.id).join(', ') || 'no finding'}`,
		}
	if (
		decision.fixedRound !== undefined &&
		row.round !== undefined &&
		decision.fixedRound <= row.round
	)
		return {
			exitCode: 2,
			output: `record decision: ${id} was raised in round ${row.round}: the round that verified its fix comes after it`,
		}
	lines[row.line] = replaceStateCell({ line: lines[row.line], written: decision.written })
	writeFileSync(ledger, lines.join('\n'))
	return { exitCode: 0, output: `record: ${id} ${decision.written} - ${ledger}` }
}

function recordSnapshot(params: { cwd: string; argv: string[] }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: ROUND_OPTIONS })
	if (typeof read === 'string') return { exitCode: 2, output: `${RECORD_SNAPSHOT_USAGE} (${read})` }
	const round = parseRound(read.values.get('round'))
	if (read.words.length !== 1 || round === undefined)
		return { exitCode: 2, output: RECORD_SNAPSHOT_USAGE }
	const root = workTreeTopOf(params.cwd)
	if (!root)
		return {
			exitCode: 1,
			output: `record: ${params.cwd} is in no git work tree: run record snapshot inside the lot's worktree`,
		}
	const folder = resolve(params.cwd, read.words[0])
	const folderRefusal = handoverFolderRefusal(folder)
	if (folderRefusal) return { exitCode: 1, output: `record: ${folderRefusal}` }
	const state = readWorktreeState(root)
	const refusal = snapshotRefusal({ root, folder, round, state })
	if (refusal) return { exitCode: 1, output: `record: ${refusal}` }
	const taken = takeSnapshot({ root, folder, round, state })
	return {
		exitCode: 0,
		output: `record: round-${round} - ${taken.copied} copied, ${taken.deleted} deleted, base ${taken.base.slice(0, 12)} - ${folder}`,
	}
}
