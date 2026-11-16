/**
 * The `lot` guard of `handover run` (33L1 6b): a hand-over whose folder is not a lot of the store is refused unless
 * the person went ahead (`--not-a-lot --by --reason`, a `decisions.md` row), a simulated or damaged lot is always
 * refused, a release hand-over is not concerned.
 */
import { basename, join } from 'node:path'

import { getArg, hasFlag } from '../config.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { appendDecision, dayOf, readDecisions } from '../review-rounds/decisions-file.ts'
import { forbiddenWordRefusal, isOneLine } from '../review-rounds/option-checks.ts'
import { DECISIONS_FILE } from '../review-rounds/review-rounds.constants.ts'
import { lotFolderOf, storeEntryOf } from '../store/lot-folder.ts'
import { readCheckedLotState, registryOfLotFolder } from '../store/lot-records.ts'
import {
	NOT_A_LOT_CARD_DETAIL,
	NOT_A_LOT_DECISION_PREFIX,
	NOT_A_LOT_FLAG,
	NOT_A_LOT_USAGE,
	NOT_A_LOT_VALUE_OPTIONS,
	NOT_A_LOT_VERB,
	OPTION_PREFIX,
	STORE_LOT_GUARD_NAME,
	STORE_LOT_GUARD_TEXTS,
} from './store-lot-guard.constants.ts'

import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type { DecisionRow } from '../review-rounds/review-rounds.types.ts'
import type { GuardVerdict } from './handover.types.ts'
import type {
	NotALotGoAhead,
	NotALotOptions,
	StoreLotGuardParams,
	StoreLotStanding,
} from './store-lot-guard.types.ts'

/**
 * The verdict of the `lot` guard; undefined (no line) for a release hand-over. A store lot passes with its name
 * (the go-ahead ignored), a simulated or damaged one is refused; a folder that is not a store lot is refused unless
 * its decisions file holds the go-ahead row, or the go-ahead is given (the row written first). A rehearsal turns
 * every refusal into a warning, writes nothing and ignores the go-ahead.
 */
export function checkStoreLot(params: StoreLotGuardParams): GuardVerdict | undefined {
	if (params.release) return undefined
	const standing = readStoreLotStanding(params.folder)
	if (standing.kind === 'storeLot') return { ok: true, detail: standing.name }
	if (standing.kind === 'refused')
		return refusalOf({ detail: standing.detail, rehearsal: params.rehearsal })
	if (standing.goAhead !== undefined) return goAheadVerdict(standing.goAhead)
	if (params.rehearsal || params.goAhead === undefined)
		return refusalOf({
			detail: fillMessage({
				template: STORE_LOT_GUARD_TEXTS.notALot,
				values: { folder: params.folder },
			}),
			rehearsal: params.rehearsal,
		})
	recordNotALotGoAhead({ folder: params.folder, ...params.goAhead, now: params.now ?? new Date() })
	return goAheadVerdict(params.goAhead)
}

/** Appends the go-ahead row `| not a store lot: <reason> | <by> | <day> |` to the folder's decisions file unless one exists. */
export function recordNotALotGoAhead(params: NotALotGoAhead & { folder: string; now: Date }): void {
	if (goAheadRowOf(params.folder) !== undefined) return
	appendDecision({
		path: join(params.folder, DECISIONS_FILE),
		title: basename(params.folder),
		decision: `${NOT_A_LOT_DECISION_PREFIX} ${params.reason}`,
		by: params.by,
		when: dayOf(params.now),
	})
}

/**
 * `--not-a-lot --by <who> --reason <text>` read from `handover run`'s words: the go-ahead (undefined without the
 * flag), or the usage refusal - the flag without both values, either empty, holding a line break or another option,
 * or `--by` / `--reason` without the flag.
 */
export function readNotALotOptions(argv: string[]): NotALotOptions {
	const [by, reason] = NOT_A_LOT_VALUE_OPTIONS.map(function valueOf(name) {
		return getArg(argv, name)
	})
	if (!hasFlag(argv, NOT_A_LOT_FLAG)) {
		const given = NOT_A_LOT_VALUE_OPTIONS.some(function isGiven(name) {
			return hasFlag(argv, name)
		})
		return given ? { usage: NOT_A_LOT_USAGE.goesWithFlag } : { goAhead: undefined }
	}
	if (!isOptionValue(by) || !isOptionValue(reason)) return { usage: NOT_A_LOT_USAGE.needsBoth }
	return { goAhead: { by, reason } }
}

/**
 * The refusal of a go-ahead whose `--by` or `--reason` holds a word of the machine's forbidden list (U3), the list
 * read from the git config of `root`; undefined when neither holds one.
 */
export function notALotWordRefusal(params: {
	root: string
	goAhead: NotALotGoAhead
}): string | undefined {
	return forbiddenWordRefusal({
		root: params.root,
		verb: NOT_A_LOT_VERB,
		options: [
			{ option: '--by', text: params.goAhead.by },
			{ option: '--reason', text: params.goAhead.reason },
		],
	})
}

/**
 * The card's `lot` line for the hand-over folder; undefined for a healthy store lot, a release hand-over, or a DONE
 * card without the go-ahead row.
 */
export function readStoreLotLine(params: {
	folder: string
	/** The lots file says `"release": true`. */
	release: boolean
	/** The card is DONE: only the go-ahead row shows a line. */
	done: boolean
}): CardGateLine | undefined {
	if (params.release) return undefined
	const standing = readStoreLotStanding(params.folder)
	if (standing.kind === 'storeLot') return undefined
	if (standing.kind === 'refused')
		return { name: STORE_LOT_GUARD_NAME, status: 'failed', detail: standing.detail }
	if (standing.goAhead !== undefined)
		return {
			name: STORE_LOT_GUARD_NAME,
			status: 'warning',
			detail: goAheadVerdict(standing.goAhead).detail,
		}
	// a DONE (or abandoned) card without the row: the run that matters is over, no line (D28)
	if (params.done) return undefined
	return { name: STORE_LOT_GUARD_NAME, status: 'failed', detail: NOT_A_LOT_CARD_DETAIL }
}

/**
 * What the `lot` guard and the card read of a hand-over folder, once: a store lot (healthy), one refused (simulated
 * or damaged, the refusal text), or a folder that is not a store lot with its go-ahead row when it holds one.
 */
function readStoreLotStanding(folder: string): StoreLotStanding {
	const lotFolder = lotFolderOf({ folder }) ?? storeEntryOf({ folder })
	if (lotFolder === undefined) return { kind: 'notALot', goAhead: goAheadRowOf(folder) }
	return storeLotStandingOf(lotFolder)
}

/** A store lot's standing: refused when simulated or damaged, else healthy with its name. */
function storeLotStandingOf(lotFolder: string): StoreLotStanding {
	const name = basename(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	const identity =
		checked === undefined
			? undefined
			: 'input' in checked
				? checked.input.identity
				: checked.identity
	// a simulated lot never commits, whatever else its records hold
	if (identity?.simulated)
		return {
			kind: 'refused',
			detail: fillMessage({ template: STORE_LOT_GUARD_TEXTS.simulated, values: { name } }),
		}
	if (checked !== undefined && 'damage' in checked)
		return {
			kind: 'refused',
			detail: fillMessage({
				template: STORE_LOT_GUARD_TEXTS.damaged,
				values: { name, reason: checked.damage },
			}),
		}
	return { kind: 'storeLot', name }
}

/** The go-ahead row of the folder's decisions file: the first whose decision starts `not a store lot:`. */
function goAheadRowOf(folder: string): NotALotGoAhead | undefined {
	const row = readDecisions(join(folder, DECISIONS_FILE)).find(function isGoAhead(
		candidate: DecisionRow,
	) {
		return candidate.decision.startsWith(NOT_A_LOT_DECISION_PREFIX)
	})
	if (row === undefined) return undefined
	return { by: row.by, reason: row.decision.slice(NOT_A_LOT_DECISION_PREFIX.length).trimStart() }
}

/** The warning naming who went ahead and why. */
function goAheadVerdict(goAhead: NotALotGoAhead): GuardVerdict {
	return {
		ok: true,
		warning: true,
		detail: fillMessage({
			template: STORE_LOT_GUARD_TEXTS.goAhead,
			values: { by: goAhead.by, reason: goAhead.reason },
		}),
	}
}

/** A refusal: exit 2 for a real run, a warning for a rehearsal (it goes on). */
function refusalOf(params: { detail: string; rehearsal: boolean }): GuardVerdict {
	return params.rehearsal
		? { ok: true, warning: true, detail: params.detail }
		: { ok: false, exitCode: 2, detail: params.detail }
}

/**
 * The word `getArg` read after an option is its value: one line (`isOneLine`), not another option (`splitArguments`'s
 * rule: a word starting `--` is an option, so the value is missing).
 */
function isOptionValue(value: string | undefined): value is string {
	return isOneLine(value) && !value.startsWith(OPTION_PREFIX)
}
