/**
 * `dialecte handover review <name|index|folder> [--json] [--print]` - opens the lot's worktree in a new editor
 * window; a hand-over holding a merge lot first writes `<hand-over folder>/review/lot.diff` (the lot's own change)
 * and opens it in the same window. `--print` prints the command line and spawns nothing.
 */
import { existsSync } from 'node:fs'

import { resultOf } from '../lib/command-result.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { EDITOR_CONFIG_KEY } from '../lib/editor/editor.constants.ts'
import { findExecutable } from '../lib/editor/find-executable.ts'
import { resolveEditor } from '../lib/editor/resolve-editor.ts'
import { findNamedHandover, storeOfFolder } from '../lib/handover/named-handover.ts'
import { isMergeLotPlan } from '../lib/handover/read-lots-file.ts'
import { reviewDiffPathOf, writeReviewDiff } from '../lib/handover/review-diff.ts'
import { jsonOf } from '../lib/print/print.ts'
import { shellWord } from '../lib/shell-quote.ts'
import { spawnDetached } from '../lib/worktree/trash.ts'
import { HANDOVER_REVIEW_JSON_INDENT, HANDOVER_REVIEW_TEXTS } from './handover-review.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	HandoverReviewJson,
	HandoverReviewParams,
	HandoverReviewRefusalJson,
} from './handover-review.types.ts'

/**
 * Opens the hand-over the arguments name in a new editor window (detached); `--print` prints the command, each word
 * shell-quoted when it needs it, and starts nothing; `--json` answers the editor, the command and the paths, with
 * `--print` too. Exit 2, nothing started, for a hand-over unknown, a worktree gone or an editor not found.
 * @intent open a hand-over in an editor, print the command that opens a hand-over
 */
export function runHandoverReview(params: HandoverReviewParams): CommandResult {
	const { argv, cwd } = params
	const json = hasFlag(argv, 'json')
	const [argument] = positionalArguments({ argv, valueOptions: [] })
	if (!argument) return refused({ json, message: HANDOVER_REVIEW_TEXTS.usage })
	const chosen = findNamedHandover({
		verb: 'review',
		argument,
		store: storeOfFolder(cwd),
		cwd,
	})
	// a hand-over this verb cannot open, its folder gone included, is a usage error
	if ('refusal' in chosen) return refused({ json, message: chosen.refusal })
	const { folder, lotsFile } = chosen.handover
	const worktree = lotsFile.repository
	if (!existsSync(worktree))
		return refused({
			json,
			message: HANDOVER_REVIEW_TEXTS.worktreeGone
				.replace('{name}', argument)
				.replace('{worktree}', worktree),
		})
	const merge = lotsFile.lots.some(isMergeLotPlan)
	const opened = merge ? [worktree, reviewDiffPathOf(folder)] : [worktree]
	const searchPath = params.searchPath ?? process.env.PATH
	const { editor, command } = resolveEditor({ cwd: worktree, searchPath, paths: opened })
	const [word, ...args] = command
	if (!findExecutable({ word, searchPath, cwd: worktree }))
		return refused({
			json,
			message: HANDOVER_REVIEW_TEXTS.editorMissing
				.replace('{word}', word)
				.replace('{key}', EDITOR_CONFIG_KEY),
		})
	if (merge) writeReviewDiff({ folder, root: worktree, head: lotsFile.head })
	const print = hasFlag(argv, 'print')
	if (print && !json) return resultOf({ exitCode: 0, lines: [command.map(shellWord).join(' ')] })
	if (!print) (params.spawner ?? spawnDetached)({ command: word, args, cwd: worktree })
	if (json) {
		const answer: HandoverReviewJson = { editor, command, opened }
		return { exitCode: 0, output: jsonOf(answer, HANDOVER_REVIEW_JSON_INDENT) }
	}
	return resultOf({
		exitCode: 0,
		lines: [
			HANDOVER_REVIEW_TEXTS.opened.replace('{editor}', editor).replace('{paths}', opened.join(' ')),
		],
	})
}

/** A refusal, exit 2: the message as one line, or `{ error }` holding it as written under `--json`. */
function refused(params: { json: boolean; message: string }): CommandResult {
	if (!params.json) return resultOf({ exitCode: 2, lines: [params.message] })
	const answer: HandoverReviewRefusalJson = { error: params.message }
	return { exitCode: 2, output: jsonOf(answer, HANDOVER_REVIEW_JSON_INDENT) }
}
