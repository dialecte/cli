/**
 * The keep texts of a lot (KEEP 3.2): kept on purpose, damaged, gone from the store, and its one next. What a lot holds
 * is read by `lot-items.ts`; this module only words its keep. Files only: no git process.
 */
import { basename } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { KEEP_DAY_LENGTH, KEEP_TEXTS } from './keep-decisions.constants.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'
import { NEXT_COMMANDS, STORE_FILES } from './store.constants.ts'

import type { KeepDecision } from './keep-decisions.types.ts'
import type { CheckedLotState } from './store.types.ts'

/**
 * The one text of a lot's keep (KEEP 3.2): `kept by decision: <why> (by <who>, <date>)`, or the text of a keep file
 * that cannot be trusted; undefined when the lot is not kept.
 */
export function keptByDecision(params: { keep: KeepDecision | undefined }): string | undefined {
	const { keep } = params
	return keep === undefined ? undefined : keepTextOf({ keep })
}

/** The text of a keep that holds (`keptByDecision` for a lot known to be kept). */
export function keepTextOf(params: { keep: KeepDecision }): string {
	const { keep } = params
	if ('unreadable' in keep)
		return fillMessage({
			template: KEEP_TEXTS.unreadableLines,
			values: { file: STORE_FILES.keep, count: String(keep.unreadable) },
		})
	if ('unreadableFile' in keep)
		return fillMessage({
			template: KEEP_TEXTS.unreadableFile,
			values: { file: STORE_FILES.keep, code: keep.unreadableFile },
		})
	return fillMessage({
		template: KEEP_TEXTS.kept,
		values: {
			reason: keep.kept.reason,
			by: keep.kept.by,
			day: keep.kept.at.slice(0, KEEP_DAY_LENGTH),
		},
	})
}

/**
 * The keep of one lot read again at the move (KEEP 3.2): its kept text; for a damaged lot not kept, its damaged text;
 * for a folder gone, that it is no longer in the store; undefined when the lot is not kept and its records hold.
 */
export function keptByDecisionOf(params: { lotFolder: string }): string | undefined {
	const { lotFolder } = params
	const name = basename(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	// fail closed where it cannot tell: a folder gone, or a damaged lot, holds every item
	if (checked === undefined) return fillMessage({ template: KEEP_TEXTS.gone, values: { name } })
	return keptOfChecked({ name, checked })
}

/**
 * The keep text of a lot already read (`keptByDecisionOf`'s rule on a checked result): its kept text; for a damaged lot
 * not kept, its damaged text; undefined when the lot is not kept and its records hold.
 */
export function keptOfChecked(params: {
	name: string
	checked: CheckedLotState
}): string | undefined {
	const { name, checked } = params
	const kept = keptByDecision({ keep: checked.keep })
	if (kept !== undefined || !('damage' in checked)) return kept
	return fillMessage({ template: KEEP_TEXTS.damaged, values: { name, damage: checked.damage } })
}

/**
 * The one next of a kept lot (KEEP 3.2): its `lot unkeep` command; for a keep file that cannot be trusted, its repair
 * by hand first.
 */
export function keepNextOf(params: { name: string; keep: KeepDecision }): string {
	const { name, keep } = params
	const next = fillMessage({ template: NEXT_COMMANDS.unkeep, values: { name } })
	if ('unreadable' in keep)
		return fillMessage({
			template: KEEP_TEXTS.repairLinesNext,
			values: { file: STORE_FILES.keep, count: String(keep.unreadable), next },
		})
	if ('unreadableFile' in keep)
		return fillMessage({
			template: KEEP_TEXTS.repairFileNext,
			values: { file: STORE_FILES.keep, code: keep.unreadableFile, next },
		})
	return next
}
