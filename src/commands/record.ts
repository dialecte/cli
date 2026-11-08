/**
 * The verbs of a lot's review rounds that write in its hand-over folder, run by `dialecte lot`:
 * `lot finding <id|folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>`,
 * `lot decide <id|folder> <finding> <state...>`, `lot snapshot <id|folder> --round <n>`: the findings ledger and
 * the per-round snapshots; `lot choice <id|folder> --by <who> <decision>`: a decision made outside the ledger, in
 * its `decisions.md`; `lot standard <id|folder> consulted <note> | not-consulted <reason>`: the standard check.
 * `runRecordVerb` runs one by its `lot` verb; `runRecord` takes it under the old word the table of the renamed
 * forms gives it.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { appendDecision, dayOf } from '../lib/review-rounds/decisions-file.ts'
import {
	appendFinding,
	findLedgerTable,
	parseDecision,
	replaceStateCell,
} from '../lib/review-rounds/findings-ledger.ts'
import { recordVerbOfWord, verbPrefix } from '../lib/review-rounds/review-round-verbs.ts'
import {
	CHOICE_OPTIONS,
	DECISIONS_FILE,
	LEDGER_FILE,
	LINE_BREAK_PATTERN,
	CHOICE_USAGE,
	DECIDE_USAGE,
	FINDING_OPTIONS,
	FINDING_USAGE,
	ROUND_OPTIONS,
	SEVERITY_SPELLINGS,
	SNAPSHOT_USAGE,
} from '../lib/review-rounds/review-rounds.constants.ts'
import { parseRound, readArguments } from '../lib/review-rounds/round-arguments.ts'
import { snapshotRefusal, takeSnapshot } from '../lib/review-rounds/snapshot-round.ts'
import {
	handoverFolderRefusal,
	readWorktreeState,
	workTreeTopOf,
} from '../lib/review-rounds/worktree-state.ts'
import { recordStandard } from '../lib/standard/record-standard.ts'
import { replaceWhole } from '../lib/store/publish.ts'

import type { RecordVerb } from '../lib/command-map/command-map.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
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
		if (verb === 'snapshot') return recordSnapshot({ cwd, argv })
		return recordStandard({ cwd, argv, now, afterTemporaryWritten })
	} catch (error) {
		return { exitCode: 1, output: `${verbPrefix(verb)}: ${(error as Error).message}` }
	}
}

function recordChoice(params: {
	cwd: string
	argv: string[]
	now?: Date
	afterTemporaryWritten?: TemporaryFileSeam
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: CHOICE_OPTIONS })
	if (typeof read === 'string') return { exitCode: 2, output: `${CHOICE_USAGE} (${read})` }
	const [folderWord, decision] = read.words
	const by = read.values.get('by') ?? ''
	if (read.words.length !== 2 || !by.trim() || !decision?.trim())
		return { exitCode: 2, output: CHOICE_USAGE }
	if (LINE_BREAK_PATTERN.test(by) || LINE_BREAK_PATTERN.test(decision))
		return {
			exitCode: 2,
			output: `${CHOICE_USAGE} (the decision and --by are one line each)`,
		}
	const folder = resolve(params.cwd, folderWord)
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return { exitCode: 1, output: `${verbPrefix('choice')}: ${refusal}` }
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
	return { exitCode: 0, output: `${verbPrefix('choice')}: by ${by} - ${path}` }
}

function recordFinding(params: {
	cwd: string
	argv: string[]
	afterTemporaryWritten?: TemporaryFileSeam
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: FINDING_OPTIONS })
	if (typeof read === 'string') return { exitCode: 2, output: `${FINDING_USAGE} (${read})` }
	const usage = { exitCode: 2, output: FINDING_USAGE }
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
			output: `${FINDING_USAGE} (the finding and --at are one non-empty line each)`,
		}
	const folder = resolve(params.cwd, words[0])
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return { exitCode: 1, output: `${verbPrefix('finding')}: ${refusal}` }
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
	return { exitCode: 0, output: `${verbPrefix('finding')}: ${id} open - ${ledger}` }
}

function recordDecision(params: {
	cwd: string
	argv: string[]
	afterTemporaryWritten?: TemporaryFileSeam
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [] })
	if (typeof read === 'string') return { exitCode: 2, output: `${DECIDE_USAGE} (${read})` }
	const [folderWord, id, ...stateWords] = read.words
	if (!folderWord || !id || stateWords.length === 0) return { exitCode: 2, output: DECIDE_USAGE }
	const decision = parseDecision(stateWords)
	if (typeof decision === 'string')
		return { exitCode: 2, output: `${verbPrefix('decide')}: ${decision}` }
	const folder = resolve(params.cwd, folderWord)
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return { exitCode: 1, output: `${verbPrefix('decide')}: ${refusal}` }
	const ledger = join(folder, LEDGER_FILE)
	if (!existsSync(ledger))
		return {
			exitCode: 1,
			output: `${verbPrefix('decide')}: no findings ledger ${ledger}: lot finding writes the first finding`,
		}
	const lines = readFileSync(ledger, 'utf8').split('\n')
	const rows = findLedgerTable(lines)?.rows ?? []
	const row = rows.find((candidate) => candidate.id === id)
	if (!row)
		return {
			exitCode: 1,
			output: `${verbPrefix('decide')}: unknown finding id ${id}; the ledger holds ${rows.map((known) => known.id).join(', ') || 'no finding'}`,
		}
	if (
		decision.fixedRound !== undefined &&
		row.round !== undefined &&
		decision.fixedRound <= row.round
	)
		return {
			exitCode: 2,
			output: `${verbPrefix('decide')}: ${id} was raised in round ${row.round}: the round that verified its fix comes after it`,
		}
	lines[row.line] = replaceStateCell({ line: lines[row.line], written: decision.written })
	replaceWhole({
		path: ledger,
		text: lines.join('\n'),
		afterTemporaryWritten: params.afterTemporaryWritten,
	})
	return {
		exitCode: 0,
		output: `${verbPrefix('decide')}: ${id} ${decision.written} - ${ledger}`,
	}
}

function recordSnapshot(params: { cwd: string; argv: string[] }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: ROUND_OPTIONS })
	if (typeof read === 'string') return { exitCode: 2, output: `${SNAPSHOT_USAGE} (${read})` }
	const round = parseRound(read.values.get('round'))
	if (read.words.length !== 1 || round === undefined) return { exitCode: 2, output: SNAPSHOT_USAGE }
	const root = workTreeTopOf(params.cwd)
	if (!root)
		return {
			exitCode: 1,
			output: `${verbPrefix('snapshot')}: ${params.cwd} is in no git work tree: run lot snapshot inside the lot's worktree`,
		}
	const folder = resolve(params.cwd, read.words[0])
	const folderRefusal = handoverFolderRefusal(folder)
	if (folderRefusal) return { exitCode: 1, output: `${verbPrefix('snapshot')}: ${folderRefusal}` }
	const state = readWorktreeState(root)
	const refusal = snapshotRefusal({ root, folder, round, state })
	if (refusal) return { exitCode: 1, output: `${verbPrefix('snapshot')}: ${refusal}` }
	const taken = takeSnapshot({ root, folder, round, state })
	return {
		exitCode: 0,
		output: `${verbPrefix('snapshot')}: round-${round} - ${taken.copied} copied, ${taken.deleted} deleted, base ${taken.base.slice(0, 12)} - ${folder}`,
	}
}
