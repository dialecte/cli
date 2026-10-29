/** The hand-over card: what is committed where, the gates run, and the command, before and after the run. */
import { mainCheckoutOf } from '../git.ts'
import { shellQuote } from '../shell-quote.ts'
import { COMMIT_SCRIPT_FILE } from './handover.constants.ts'
import { commitSizeOf, workingTreeSizeOf } from './lot-size.ts'

import type { Card } from '../card/card.types.ts'
import type { HandoverCard, ResolvedLot } from './handover.types.ts'

export function buildHandoverCard(params: {
	/** Where the lots are committed. */
	root: string
	/** Where the commits named in `commits` are, when not in `root` (a rehearsal clone). */
	commitRoot?: string
	folder: string
	branch: string
	head: string
	gates: string | undefined
	lots: readonly ResolvedLot[]
	/** The commits of the lots committed already, the first lot first. */
	commits: readonly string[]
}): HandoverCard {
	const { root } = params
	const commitRoot = params.commitRoot ?? root
	return {
		repository: mainCheckoutOf(root),
		worktree: root,
		branch: params.branch,
		head: params.head,
		gates: params.gates ?? 'not stated',
		lots: params.lots.map(function cardLot(lot, index) {
			const commit = params.commits[index]
			const size = commit
				? commitSizeOf({ root: commitRoot, commit })
				: workingTreeSizeOf({ root: commitRoot, files: lot.files, deletedFiles: lot.deletedFiles })
			return {
				index: index + 1,
				fileCount: lot.files.length + lot.deletedFiles.length,
				subject: lot.message.trim().split('\n')[0],
				...size,
				...(commit && { commit }),
			}
		}),
		command: `cd ${shellQuote(params.folder)} && bash ${COMMIT_SCRIPT_FILE}`,
	}
}

/** The card as rows: the lots aligned in columns, a committed one with its commit. */
export function handoverCardRows(card: HandoverCard): Card {
	const columns = card.lots.map((lot) => [
		String(lot.index),
		`${lot.fileCount} ${lot.fileCount === 1 ? 'file' : 'files'}`,
		`+${lot.insertions} -${lot.deletions}`,
		lot.commit ? lot.commit.slice(0, 7) : 'pending',
		lot.subject,
	])
	const widths = [0, 1, 2, 3].map((column) =>
		Math.max(...columns.map((cells) => cells[column].length)),
	)
	return {
		title: 'hand-over',
		rows: [
			{ label: 'repository', lines: [card.repository] },
			{ label: 'worktree', lines: [card.worktree] },
			{ label: 'branch', lines: [card.branch] },
			{ label: 'HEAD', lines: [card.head.slice(0, 12)] },
			{ label: 'gates', lines: card.gates.split(/\r?\n/) },
			{
				label: `lots (${card.lots.length})`,
				lines: columns.map((cells) =>
					cells.map((cell, column) => (column < 4 ? cell.padEnd(widths[column]) : cell)).join('  '),
				),
			},
			{ label: 'run', lines: [card.command] },
		],
	}
}
