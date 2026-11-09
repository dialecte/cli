/**
 * The lot folder as the lot's hand-over folder (33S section 4): where `handover write --out <id|folder>` writes, what
 * it refuses there, the canceled lot `handover run` does not run, and the lot `handover abandon` never ends. One
 * place decides whether a folder is a lot folder and what a verb refuses on it; reads files only.
 */
import { realPathOf, realPathThroughAncestors } from '../file-system.ts'
import { lotFolderOf } from '../store/lot-folder.ts'
import { readLotStateInput, registryOfLotFolder } from '../store/lot-records.ts'
import { lotState } from '../store/lot-state.ts'
import { resolveLot } from '../store/resolve-lot.ts'
import { NEXT_COMMANDS } from '../store/store.constants.ts'
import { findHandoverStore, registeredEntryOf } from './handover-store.ts'
import { HANDOVER_LOT_REFUSALS, HANDOVER_REFUSED_LOT_STATES } from './handover.constants.ts'

import type { LotStateInput, LotStateReport } from '../store/store.types.ts'
import type { LotsFile } from './handover.types.ts'

/**
 * The folder `--out <word>` names from `cwd`, as a real path: a lot (index, full name, a path to its folder or
 * `.dialecte/lot`) gives its folder; any other word a folder, real through its nearest existing ancestor, with the
 * note of a word that names both a folder and a lot (the folder wins). An index several stores hold gives the
 * refusal listing them.
 */
export function resolveHandoverOut(params: {
	word: string
	cwd: string
}): { out: string; outNote: string | undefined } | { refusal: string } {
	const resolved = resolveLot({ argument: params.word, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in resolved) return { refusal: resolved.output }
	if ('lot' in resolved) return { out: resolved.lot, outNote: undefined }
	return { out: realPathThroughAncestors(resolved.folder), outNote: resolved.note }
}

/**
 * Why a hand-over of `lotsFile` is not written into `out`, checked in this order: when `out` is a lot folder, a
 * simulated lot, a `canceled` or `failed` lot, an open question, a lots file of another worktree or branch; for any
 * folder, a registry entry `committed` for it. Undefined when it may be written.
 */
export function handoverWriteRefusal(params: {
	out: string
	lotsFile: LotsFile
}): string | undefined {
	return (
		lotFolderWriteRefusal(params) ??
		committedEntryRefusal({ repository: params.lotsFile.repository, folder: params.out })
	)
}

/** `handover run` on the folder of a `canceled` lot: the refusal naming it; undefined for any other folder. */
export function canceledLotRunRefusal(params: { folder: string }): string | undefined {
	const lot = lotOfFolder(params)
	if (lot?.report.state !== 'canceled') return undefined
	return HANDOVER_LOT_REFUSALS.runCanceled.replace('{name}', lot.input.identity.name)
}

/** `handover abandon` on a lot folder: the refusal naming the redo and the stop of the lot; undefined otherwise. */
export function lotAbandonRefusal(params: { folder: string }): string | undefined {
	const lot = lotOfFolder(params)
	if (lot === undefined) return undefined
	return HANDOVER_LOT_REFUSALS.abandon.replaceAll('{name}', lot.input.identity.name)
}

/** The lot whose folder `folder` is, its records and derived state; undefined for a folder that is no lot. */
function lotOfFolder(params: {
	folder: string
}): { input: LotStateInput; report: LotStateReport } | undefined {
	const lotFolder = lotFolderOf(params)
	if (lotFolder === undefined) return undefined
	const input = readLotStateInput({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	return input && { input, report: lotState(input) }
}

/** The refusals of a hand-over written into a lot folder, in their order; undefined for a folder that is no lot. */
function lotFolderWriteRefusal(params: { out: string; lotsFile: LotsFile }): string | undefined {
	const lot = lotOfFolder({ folder: params.out })
	if (lot === undefined) return undefined
	const { identity } = lot.input
	if (identity.simulated || identity.worktree === null)
		return HANDOVER_LOT_REFUSALS.simulated.replace('{name}', identity.name)
	if (HANDOVER_REFUSED_LOT_STATES.includes(lot.report.state))
		return HANDOVER_LOT_REFUSALS.ended
			.replace('{name}', identity.name)
			.replace('{state}', lot.report.state)
	const [question] = lot.report.openQuestions
	if (question)
		return HANDOVER_LOT_REFUSALS.question
			.replace('{question}', question.id)
			.replace(
				'{answer}',
				NEXT_COMMANDS.answer.replace('{name}', identity.name).replace('{question}', question.id),
			)
	if (realPathOf(params.lotsFile.repository) !== realPathOf(identity.worktree))
		return HANDOVER_LOT_REFUSALS.repository
			.replace('{repository}', params.lotsFile.repository)
			.replace('{worktree}', identity.worktree)
	if (params.lotsFile.branch !== identity.branch)
		return HANDOVER_LOT_REFUSALS.branch
			.replace('{branch}', params.lotsFile.branch)
			.replace('{lotBranch}', identity.branch)
	return undefined
}

/** A registry entry `committed` for `folder` (by real path) in the store of `repository`: the refusal naming it. */
function committedEntryRefusal(params: { repository: string; folder: string }): string | undefined {
	const store = findHandoverStore(params.repository)
	const entry =
		store === undefined ? undefined : registeredEntryOf({ store, folder: params.folder })
	if (entry?.state !== 'committed') return undefined
	return HANDOVER_LOT_REFUSALS.committed.replace('{entry}', entry.name)
}
