/**
 * `dialecte lot verify <id|folder> --by <who> --note <text>`: a late fix verified (33L1 6b, D19). Appends
 * `{ schema, at, by, note, state }` to the lot folder's `verify.jsonl`, `state` the worktree's state hash.
 */
import { join, resolve } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { appendLine } from '../lib/events/write-event.ts'
import { realPathOf } from '../lib/file-system.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import {
	NOTHING_LATE_REFUSAL,
	OTHER_WORKTREE_REFUSAL,
	VERIFY_LINE_SCHEMA,
	VERIFY_OPTIONS,
	VERIFY_SHOWN_STATE_LENGTH,
	VERIFY_USAGE,
} from '../lib/review-rounds/review-rounds.constants.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { snapshotRounds } from '../lib/review-rounds/round-names.ts'
import { workTreeTopOf } from '../lib/review-rounds/worktree-state.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { VerifyLine } from '../lib/review-rounds/review-rounds.types.ts'

/** `lot verify` on its words, the folder word already resolved; run inside the lot's worktree. */
export function runLotVerify(params: { cwd: string; argv: string[]; now?: Date }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: VERIFY_OPTIONS })
	if (typeof read === 'string') return answerOf({ exitCode: 2, line: VERIFY_USAGE })
	const by = read.values.get('by')
	const note = read.values.get('note')
	if (read.words.length !== 1 || !isOneLine(by) || !isOneLine(note))
		return answerOf({ exitCode: 2, line: VERIFY_USAGE })
	const root = workTreeTopOf(params.cwd)
	if (!root)
		return answerOf({
			exitCode: 1,
			line: `lot verify: ${params.cwd} is in no git work tree: run lot verify inside the lot's worktree`,
		})
	const wordRefusal = forbiddenWordRefusal({
		root,
		verb: 'verify',
		options: [
			{ option: '--by', text: by },
			{ option: '--note', text: note },
		],
	})
	if (wordRefusal) return answerOf({ exitCode: 2, line: wordRefusal })
	const folder = resolve(params.cwd, read.words[0])
	const worktreeRefusal = otherWorktreeRefusal({ root, folder })
	if (worktreeRefusal) return answerOf({ exitCode: 2, line: worktreeRefusal })
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
	return answerOf({
		exitCode: 0,
		line: `lot verify: ${state.slice(0, VERIFY_SHOWN_STATE_LENGTH)} by ${by} - ${file}`,
	})
}

/**
 * The refusal of a verify run in another work tree than the lot's (R1-8): the state hashed would be another tree's,
 * so the card would stay unverified, or match the wrong tree. Both named by their real paths; undefined for a plain
 * hand-over folder (no identity, or one with no worktree) and for the lot's own worktree.
 */
function otherWorktreeRefusal(params: { root: string; folder: string }): string | undefined {
	const worktree = readIdentity({ lotFolder: params.folder })?.worktree
	if (worktree === undefined || worktree === null) return undefined
	const here = realPathOf(params.root)
	const lot = realPathOf(worktree)
	if (here === lot) return undefined
	return fillMessage({ template: OTHER_WORKTREE_REFUSAL, values: { here, lot } })
}

/** A result of one line. */
function answerOf(params: { exitCode: number; line: string }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: [params.line] })
}
