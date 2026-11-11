/** The hand-over a verb's argument names (a registry name, a worktree index or a folder), as every verb reads it. */
import { existsSync } from 'node:fs'

import { resultOf } from '../command-result.ts'
import { workTreeTopOf } from '../review-rounds/worktree-state.ts'
import { entryOfArgument, findHandoverStore, resolveHandoverArgument } from './handover-store.ts'
import { HANDOVER_STORE_REFUSALS } from './handover.constants.ts'
import { readHandoverFolder } from './read-handover-folder.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { HandoverFolder, NamedHandoverRefusal } from './handover.types.ts'

/** The store of the repository `folder` is in; undefined outside every repository. */
export function storeOfFolder(folder: string): string | undefined {
	const root = workTreeTopOf(folder)
	return root && findHandoverStore(root)
}

/** The refusal of an argument naming an entry whose folder is gone (it names the folder); none otherwise. */
export function goneEntryRefusal(params: {
	verb: string
	argument: string
	store: string | undefined
}): string | undefined {
	const entry = entryOfArgument(params)
	if (!entry || existsSync(entry.folder)) return undefined
	return HANDOVER_STORE_REFUSALS.folderGone
		.replace('{verb}', params.verb)
		.replace('{name}', entry.name)
		.replace('{folder}', entry.folder)
}

/**
 * The hand-over an argument of `show`, `review` or `abandon` names; an entry whose folder is gone: exit 1 naming
 * the folder; else the refusal naming the argument (exit 2).
 */
export function readNamedHandover(params: {
	verb: string
	argument: string
	store: string | undefined
	cwd: string
}): { handover: HandoverFolder } | CommandResult {
	const found = findNamedHandover(params)
	if ('handover' in found) return found
	return resultOf({ exitCode: found.exitCode, lines: [found.refusal] })
}

/**
 * `readNamedHandover` with the refusal as its message, unprinted: a verb answering `--json` prints it in its own
 * shape.
 */
export function findNamedHandover(params: {
	verb: string
	argument: string
	store: string | undefined
	cwd: string
}): { handover: HandoverFolder } | NamedHandoverRefusal {
	const gone = goneEntryRefusal(params)
	if (gone) return { exitCode: 1, refusal: gone }
	const folder = resolveHandoverArgument(params)
	const handover = readHandoverFolder(folder)
	if (typeof handover !== 'string') return { handover }
	return {
		exitCode: 2,
		refusal: HANDOVER_STORE_REFUSALS.noHandover
			.replace('{verb}', params.verb)
			.replace('{argument}', params.argument)
			.replace('{reason}', handover),
	}
}
