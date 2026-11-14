/**
 * `dialecte lot risk <id|folder> [--json]` and `dialecte lot risk <id|folder> --effort low|medium|high ...`: the risk
 * class of a lot, its effort, and the person's effort record (33L1 section 3).
 */
import { basename, join, resolve } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { jsonOf } from '../lib/print/print.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { workTreeTopOf } from '../lib/review-rounds/worktree-state.ts'
import { tryDeriveLotRiskClass } from '../lib/risk/derive-lot-risk-class.ts'
import { goAheadText, riskReasonText } from '../lib/risk/risk-reason.ts'
import {
	appendRiskLine,
	effectiveEffort,
	highestRiskClass,
	isEffort,
	isEffortBelow,
	isRiskClass,
	readRiskRecords,
	roundsOfClass,
} from '../lib/risk/risk-records.ts'
import {
	CLASS_OF_EFFORT,
	RISK_EFFORT_BELOW_LINE,
	RISK_FILE,
	RISK_SCHEMA,
} from '../lib/risk/risk.constants.ts'
import { lotFolderOf } from '../lib/store/lot-folder.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { UNKNOWN_EFFORT_CAP } from '../lib/store/next-station.constants.ts'
import { QUESTIONS_CLOSED_STATES } from '../lib/store/store.constants.ts'
import {
	LOT_RISK_ALREADY,
	LOT_RISK_BELOW_REFUSAL,
	LOT_RISK_DAMAGED_REFUSAL,
	LOT_RISK_FLAGS,
	LOT_RISK_HEAD,
	LOT_RISK_NO_EFFORT,
	LOT_RISK_REASON_INDENT,
	LOT_RISK_RECORDED,
	LOT_RISK_TERMINAL_REFUSAL,
	LOT_RISK_UNKNOWN_CLASS,
	LOT_RISK_USAGE,
	LOT_RISK_VALUE_OPTIONS,
	LOT_RISK_VERB,
	LOT_RISK_WRITE_FAILURE,
	LOT_RISK_WRITE_ONLY_OPTIONS,
} from './lot-risk.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'
import type { RiskEffortLine, RiskReason } from '../lib/risk/risk.types.ts'
import type { LotRiskAnswer, LotRiskEffortOptions } from './lot-risk.types.ts'

/** `lot risk` on its words, the folder word already resolved; run from a work tree. */
export function runLotRisk(params: { cwd: string; argv: string[]; now?: Date }): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: LOT_RISK_VALUE_OPTIONS,
		flags: LOT_RISK_FLAGS,
	})
	if (typeof read === 'string' || read.words.length !== 1)
		return answerOf({ exitCode: 2, line: LOT_RISK_USAGE })
	const folder = resolve(params.cwd, read.words[0])
	if (!read.values.has('effort')) {
		const writeOnly = LOT_RISK_WRITE_ONLY_OPTIONS.some(function isGiven(option) {
			return read.values.has(option)
		})
		if (writeOnly) return answerOf({ exitCode: 2, line: LOT_RISK_USAGE })
		return readLotRisk({ cwd: params.cwd, folder, json: read.flags.has('json') })
	}
	const options = effortOptionsOf({ read })
	if (options === undefined) return answerOf({ exitCode: 2, line: LOT_RISK_USAGE })
	return recordEffort({ cwd: params.cwd, folder, options, now: params.now ?? new Date() })
}

/** The checked options of a write; undefined for a usage fault (a value out of its list, a blank or broken text). */
function effortOptionsOf(params: { read: RoundArguments }): LotRiskEffortOptions | undefined {
	const { values, flags } = params.read
	const effort = values.get('effort')
	const riskClass = values.get('class')
	const by = values.get('by')
	const reason = values.get('reason')
	if (flags.has('json') || !isEffort(effort) || !isOneLine(by)) return undefined
	if (riskClass !== undefined && !isRiskClass(riskClass)) return undefined
	if (reason !== undefined && !isOneLine(reason)) return undefined
	return {
		effort,
		...(riskClass === undefined ? {} : { class: riskClass }),
		by,
		...(reason === undefined ? {} : { reason }),
	}
}

/**
 * The read: the class now, the effort, whether it is below and the cap; nothing written. Refused for a damaged store
 * lot; a derivation that cannot run ends the text with its `!` line (exit 0).
 */
function readLotRisk(params: { cwd: string; folder: string; json: boolean }): CommandResult {
	const damaged = storeLotRefusal({ folder: params.folder, refuseTerminal: false })
	if (damaged !== undefined) return answerOf({ exitCode: 2, line: damaged })
	const { reading, comparedClass, effortLine, warning } = lotRiskReadingOf(params)
	if (params.json) return { exitCode: 0, output: jsonOf(reading) }
	const effort = reading.effort ?? LOT_RISK_NO_EFFORT
	const head = fillMessage({
		template: LOT_RISK_HEAD,
		values: {
			class: reading.class ?? LOT_RISK_UNKNOWN_CLASS,
			effort,
			cap: String(reading.cap),
		},
	})
	const below =
		reading.below && comparedClass !== undefined
			? [
					fillMessage({
						template: RISK_EFFORT_BELOW_LINE,
						values: { effort, class: comparedClass, goAhead: goAheadText({ effortLine }) },
					}),
				]
			: []
	return resultOf({
		exitCode: 0,
		lines: [
			head,
			...below,
			...reading.reasons.map(reasonLineOf),
			...(warning === undefined ? [] : [warning]),
		],
	})
}

/**
 * What a read answers, from the derivation now (else the last derived line) and the folder's effort records, with the
 * class the effort is compared to (the highest of the class and the last effort line's class), that effort line (its
 * go-ahead) and the warning of a derivation that could not run.
 */
function lotRiskReadingOf(params: { cwd: string; folder: string }): LotRiskAnswer {
	const { folder } = params
	const records = readRiskRecords({ folder })
	const derived = tryDeriveLotRiskClass({ folder, cwd: params.cwd })
	const derivation = derived.derivation ?? records.derived.at(-1)
	const effort = effectiveEffort({ folder })
	const effortLine = records.effort.at(-1)
	const comparedClass = highestRiskClass({
		classes: [derivation?.class, effortLine?.class],
	})
	const below =
		effort !== undefined &&
		comparedClass !== undefined &&
		isEffortBelow({ effort, riskClass: comparedClass })
	const cap =
		effort === undefined
			? UNKNOWN_EFFORT_CAP
			: roundsOfClass({
					riskClass:
						highestRiskClass({ classes: [CLASS_OF_EFFORT[effort], comparedClass] }) ??
						CLASS_OF_EFFORT[effort],
				})
	return {
		reading: {
			class: derivation?.class ?? null,
			reasons: derivation?.reasons ?? [],
			effort: effort ?? null,
			below,
			cap,
		},
		comparedClass,
		effortLine,
		warning: derived.warning,
	}
}

/** A reason as its line: the shared reason text, indented. */
function reasonLineOf(reason: RiskReason): string {
	return `${LOT_RISK_REASON_INDENT}${riskReasonText(reason)}`
}

/**
 * The write: refused for a damaged or terminal store lot, a forbidden word, or an effort below the class without a
 * reason; nothing appended when the last effort line holds the same effort, class and reason (33L1 D30: a go-ahead
 * given after the class rose is a new line). A derivation that cannot run
 * leaves the last derived line (or nothing) to compare against.
 */
function recordEffort(params: {
	cwd: string
	folder: string
	options: LotRiskEffortOptions
	now: Date
}): CommandResult {
	const { folder, options } = params
	const refusal = writeRefusal(params)
	if (refusal !== undefined) return answerOf({ exitCode: 2, line: refusal })
	const file = join(folder, RISK_FILE)
	const last = readRiskRecords({ folder }).effort.at(-1)
	if (
		last !== undefined &&
		last.effort === options.effort &&
		last.class === options.class &&
		last.reason === options.reason
	)
		return answerOf({
			exitCode: 0,
			line: fillMessage({ template: LOT_RISK_ALREADY, values: { effort: options.effort, file } }),
		})
	const line: RiskEffortLine = {
		schema: RISK_SCHEMA,
		kind: 'effort',
		at: params.now.toISOString(),
		effort: options.effort,
		...(options.class === undefined ? {} : { class: options.class }),
		by: options.by,
		...(options.reason === undefined ? {} : { reason: options.reason }),
	}
	try {
		appendRiskLine({ folder, line })
	} catch (error) {
		return answerOf({
			exitCode: 1,
			line: fillMessage({
				template: LOT_RISK_WRITE_FAILURE,
				values: { message: (error as Error).message },
			}),
		})
	}
	return answerOf({
		exitCode: 0,
		line: fillMessage({
			template: LOT_RISK_RECORDED,
			values: { effort: options.effort, by: options.by, file },
		}),
	})
}

/**
 * Why a write is refused, in order: a damaged or terminal store lot, a forbidden word, an effort below the class
 * without a reason (the class derived now, else the last derived line, raised by `--class`); undefined when it is not.
 */
function writeRefusal(params: {
	cwd: string
	folder: string
	options: LotRiskEffortOptions
}): string | undefined {
	const { folder, options } = params
	const storeRefusal = storeLotRefusal({ folder, refuseTerminal: true })
	if (storeRefusal !== undefined) return storeRefusal
	const wordRefusal = forbiddenWordRefusal({
		root: workTreeTopOf(params.cwd) ?? params.cwd,
		verb: LOT_RISK_VERB,
		options: [
			{ option: '--by', text: options.by },
			...(options.reason === undefined ? [] : [{ option: '--reason', text: options.reason }]),
		],
	})
	if (wordRefusal !== undefined) return wordRefusal
	const derivation =
		tryDeriveLotRiskClass({ folder, cwd: params.cwd }).derivation ??
		readRiskRecords({ folder }).derived.at(-1)
	const comparedClass = highestRiskClass({ classes: [derivation?.class, options.class] })
	if (
		options.reason !== undefined ||
		comparedClass === undefined ||
		!isEffortBelow({ effort: options.effort, riskClass: comparedClass })
	)
		return undefined
	return fillMessage({
		template: LOT_RISK_BELOW_REFUSAL,
		values: { effort: options.effort, class: comparedClass },
	})
}

/**
 * The refusal of a damaged store lot (named by its folder, as every reader names it), and with `refuseTerminal` of one
 * that is committed, canceled or failed; undefined for any other folder.
 */
function storeLotRefusal(params: { folder: string; refuseTerminal: boolean }): string | undefined {
	const lotFolder = lotFolderOf({ folder: params.folder })
	if (lotFolder === undefined) return undefined
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined) return undefined
	if (!('input' in checked))
		return fillMessage({
			template: LOT_RISK_DAMAGED_REFUSAL,
			values: { name: basename(lotFolder), reason: checked.damage },
		})
	if (!params.refuseTerminal) return undefined
	const { state } = lotState(checked.input)
	if (!QUESTIONS_CLOSED_STATES.includes(state)) return undefined
	return fillMessage({
		template: LOT_RISK_TERMINAL_REFUSAL,
		values: { name: checked.input.identity.name, state },
	})
}

/** A result of one line. */
function answerOf(params: { exitCode: number; line: string }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: [params.line] })
}
