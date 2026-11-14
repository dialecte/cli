import { basename, join } from 'node:path'

import { linesOf } from '../../print/print.ts'
import { handoverFolderRefusal } from '../../review-rounds/worktree-state.ts'
import { readIdentity } from '../../store/identity.ts'
import { resolveLot, lotOfWorktree } from '../../store/resolve-lot.ts'
import { stateFolder } from '../../store/state-folder.ts'
import { STORE_FILES } from '../../store/store.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { workTreeHolding } from '../standard/work-tree-holding.ts'
import {
	ASK_FOLDER_REFUSALS,
	REFUSAL_LINE_SEPARATOR,
	STATE_ASKS_SEGMENTS,
} from './ask.constants.ts'

import type { AskFolder, AskFolderAnswer, AskFolderOfParams } from './ask.types.ts'

/**
 * Where an ask lives (D16): `--lot <id|folder>` (a store lot by id or folder, or a hand-over folder outside every
 * repository), else the lot of the worktree, else the state folder's `asks`. Refuses a `--lot` folder inside a
 * repository and a state folder inside a work tree. Makes nothing.
 */
export function askFolderOf(params: AskFolderOfParams): AskFolderAnswer {
	const { cwd, lot, environment } = params
	const stateAsks = join(stateFolder({ environment }), ...STATE_ASKS_SEGMENTS)
	if (lot === undefined) {
		const worktreeLot = lotOfWorktree({ cwd })
		return worktreeLot === undefined
			? (stateRefusal({ stateAsks }) ?? {
					folder: stateAsks,
					lotName: null,
					lotFolder: null,
					eventsFile: join(stateAsks, STORE_FILES.events),
				})
			: storeLotFolder({ lotFolder: worktreeLot })
	}
	// the `lot` verbs' `<id|folder>` resolution: an index, a full name, a lot folder, else a folder
	const resolved = resolveLot({ argument: lot, cwd, mode: 'write' })
	if ('exitCode' in resolved)
		return { refused: linesOf(resolved.output).join(REFUSAL_LINE_SEPARATOR) }
	if ('lot' in resolved) return storeLotFolder({ lotFolder: resolved.lot })
	const refusal = handoverFolderRefusal(resolved.folder)
	if (refusal !== undefined) return { refused: refusal }
	return (
		stateRefusal({ stateAsks }) ?? {
			folder: join(resolved.folder, STORE_FILES.asks),
			lotName: null,
			lotFolder: null,
			eventsFile: join(stateAsks, STORE_FILES.events),
		}
	)
}

/** The asks and the events of a store lot, named by its identity (the folder's name when it does not read). */
function storeLotFolder(params: { lotFolder: string }): AskFolder {
	const { lotFolder } = params
	return {
		folder: join(lotFolder, STORE_FILES.asks),
		lotName: readIdentity({ lotFolder })?.name ?? basename(lotFolder),
		lotFolder,
		eventsFile: join(lotFolder, STORE_FILES.events),
	}
}

/** The refusal of the state folder's asks inside a git work tree; undefined outside every work tree. */
function stateRefusal(params: { stateAsks: string }): { refused: string } | undefined {
	const top = workTreeHolding({ path: params.stateAsks })
	return top === undefined
		? undefined
		: {
				refused: fillMessage({
					template: ASK_FOLDER_REFUSALS.stateInWorkTree,
					values: { path: params.stateAsks, top },
				}),
			}
}
