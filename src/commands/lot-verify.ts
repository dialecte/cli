/**
 * `dialecte lot verify <id|folder> --by <who> --note <text>`: a late fix verified (33L1 6b, D19). Appends
 * `{ schema, at, by, note, state }` to the lot folder's `verify.jsonl`, `state` the state hash of the lot's own
 * worktree (`lotTreeOf`), wherever it runs.
 */
import { join, resolve } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { appendLine } from '../lib/events/write-event.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { refreshReviewRecord } from '../lib/review-rounds/review-record.ts'
import {
	NOTHING_LATE_REFUSAL,
	VERIFY_LINE_SCHEMA,
	VERIFY_OPTIONS,
	VERIFY_SHOWN_STATE_LENGTH,
	VERIFY_USAGE,
} from '../lib/review-rounds/review-rounds.constants.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { snapshotRounds } from '../lib/review-rounds/round-names.ts'
import { lotTreeOf } from '../lib/store/lot-tree.ts'
import {
	PUBLIC_TEXT_REFUSAL,
	PUBLIC_TEXT_UNCHECKED_REFUSAL,
} from '../lib/store/public-text.constants.ts'
import { folderPlanEntryIds, publicTextLabel } from '../lib/store/public-text.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { VerifyLine } from '../lib/review-rounds/review-rounds.types.ts'

/** `lot verify` on its words, the folder word already resolved; a store lot's own worktree hashed, from anywhere. */
export function runLotVerify(params: { cwd: string; argv: string[]; now?: Date }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: VERIFY_OPTIONS })
	if (typeof read === 'string') return answerOf({ exitCode: 2, line: VERIFY_USAGE })
	const by = read.values.get('by')
	const note = read.values.get('note')
	if (read.words.length !== 1 || !isOneLine(by) || !isOneLine(note))
		return answerOf({ exitCode: 2, line: VERIFY_USAGE })
	const folder = resolve(params.cwd, read.words[0])
	// a store lot's own worktree from anywhere (the orchestrator signs from the main checkout), else the cwd's
	const tree = lotTreeOf({ folder, cwd: params.cwd })
	if (tree === undefined)
		return answerOf({
			exitCode: 1,
			line: `lot verify: ${params.cwd} is in no git work tree: run lot verify inside the lot's worktree`,
		})
	if ('refusal' in tree) return answerOf({ exitCode: 2, line: `lot verify: ${tree.refusal}` })
	const { root } = tree
	const textRefusal = optionTextRefusal({ root, folder, by, note })
	if (textRefusal) return answerOf({ exitCode: 2, line: textRefusal })
	if (snapshotRounds(folder).length === 0)
		return answerOf({ exitCode: 2, line: NOTHING_LATE_REFUSAL })
	const state = computeStateHash(root)
	const line: VerifyLine = {
		schema: VERIFY_LINE_SCHEMA,
		at: (params.now ?? new Date()).toISOString(),
		by,
		note,
		state,
	}
	const file = join(folder, STORE_FILES.verify)
	try {
		appendLine({
			file,
			line: Buffer.from(`${JSON.stringify(line)}\n`, 'utf8'),
			limit: EVENT_LINE_LIMIT,
		})
	} catch (error) {
		return answerOf({ exitCode: 1, line: `lot verify: ${(error as Error).message}` })
	}
	const warning = refreshReviewRecord({ folder })
	const answer = `lot verify: ${state.slice(0, VERIFY_SHOWN_STATE_LENGTH)} by ${by} - ${file}`
	return resultOf({ exitCode: 0, lines: warning === undefined ? [answer] : [answer, warning] })
}

/**
 * The refusal of a `--by` or `--note` holding a forbidden word, or of a `--by` holding what a public record never
 * holds, an entry id of the plans that hold the lot included (it is copied to `review.jsonl`; the note stays private),
 * or whose lists cannot be read; undefined when none.
 */
function optionTextRefusal(params: {
	root: string
	folder: string
	by: string
	note: string
}): string | undefined {
	const { root, by } = params
	const wordRefusal = forbiddenWordRefusal({
		root,
		verb: 'verify',
		options: [
			{ option: '--by', text: by },
			{ option: '--note', text: params.note },
		],
	})
	if (wordRefusal) return wordRefusal
	let label: string | undefined
	try {
		label = publicTextLabel({ text: by, root, ids: folderPlanEntryIds({ folder: params.folder }) })
	} catch (error) {
		return fillMessage({
			template: PUBLIC_TEXT_UNCHECKED_REFUSAL,
			values: { verb: 'verify', option: '--by', reason: (error as Error).message },
		})
	}
	if (label === undefined) return undefined
	return fillMessage({
		template: PUBLIC_TEXT_REFUSAL,
		values: { verb: 'verify', option: '--by', label },
	})
}

/** A result of one line. */
function answerOf(params: { exitCode: number; line: string }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: [params.line] })
}
