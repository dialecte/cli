import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { appendLine } from '../events/write-event.ts'
import { readIdentity } from '../store/identity.ts'
import { REVIEW_ROUND_CAPS, UNKNOWN_EFFORT_CAP } from '../store/next-station.constants.ts'
import {
	CLASS_OF_EFFORT,
	RISK_CLASSES,
	RISK_DERIVED_FROM,
	RISK_FILE,
	RISK_LINE_LIMIT,
	RISK_REASON_KINDS,
	RISK_SCHEMA,
} from './risk.constants.ts'

import type {
	Effort,
	RiskCap,
	RiskClass,
	RiskDerivedLine,
	RiskEffortLine,
	RiskLine,
	RiskReason,
	RiskRecords,
	RiskStanding,
} from './risk.types.ts'

/** Appends one `effort` or `derived` line to `<folder>/risk.jsonl` in one write; an over-long derived line is cut. */
export function appendRiskLine(params: { folder: string; line: RiskLine }): void {
	const line =
		params.line.kind === 'derived' ? fittingDerivedLine({ line: params.line }) : params.line
	appendLine({
		file: join(params.folder, RISK_FILE),
		line: lineBufferOf({ line }),
		limit: RISK_LINE_LIMIT,
	})
}

/** The lines of `<folder>/risk.jsonl` in file order; a line that is not a whole line of this schema is counted. */
export function readRiskRecords(params: { folder: string }): RiskRecords {
	let content: string
	try {
		content = readFileSync(join(params.folder, RISK_FILE), 'utf8')
	} catch {
		return { effort: [], derived: [], skipped: 0 }
	}
	const lines = content.split('\n')
	// the text after the last `\n` is a line without its `\n`: never trusted, even when it parses
	const torn = lines.pop()
	const records: RiskRecords = {
		effort: [],
		derived: [],
		skipped: torn === undefined || torn === '' ? 0 : 1,
	}
	for (const text of lines) {
		// an empty line holds no record (a torn-end newline can leave one): neither read nor counted
		if (text === '') continue
		const line = parseRiskLine({ text })
		if (line === undefined) records.skipped += 1
		else if (line.kind === 'effort') records.effort.push(line)
		else records.derived.push(line)
	}
	return records
}

/** The last `effort` line's effort (file order), else the identity's effort level, else undefined. */
export function effectiveEffort(params: { folder: string }): Effort | undefined {
	const lastEffortLine = readRiskRecords(params).effort.at(-1)
	if (lastEffortLine !== undefined) return lastEffortLine.effort
	const level = readIdentity({ lotFolder: params.folder })?.effort?.level
	return isEffort(level) ? level : undefined
}

/**
 * The effort of a folder against its class, from its records only (nothing derived now): the effective effort, the
 * last effort and derived lines, the class the effort is held to (the highest of the last derived class and the
 * current effort line's class, 33L1 D26) and whether the effort is below it.
 */
export function riskStandingOf(params: { folder: string }): RiskStanding {
	const records = readRiskRecords(params)
	const effort = effectiveEffort(params)
	const effortLine = records.effort.at(-1)
	const derived = records.derived.at(-1)
	const comparedClass = highestRiskClass({ classes: [derived?.class, effortLine?.class] })
	return {
		effort,
		effortLine,
		derived,
		comparedClass,
		below:
			effort !== undefined &&
			comparedClass !== undefined &&
			isEffortBelow({ effort, riskClass: comparedClass }),
	}
}

/**
 * The cap of review rounds of a folder: the rounds of the highest of the effort's class, the derived class and the
 * effort line's class, the derived class being `derivedNow` (a class derived now and not yet appended, 33L1 D30, D31)
 * else the last derived line's; the unknown-effort cap when no effort is recorded, whatever the class.
 */
export function riskCapOf(params: { folder: string; derivedNow?: RiskClass }): RiskCap {
	const { folder } = params
	const effort = effectiveEffort({ folder })
	if (effort === undefined)
		return { cap: UNKNOWN_EFFORT_CAP, effort: undefined, class: undefined, raisedBy: undefined }
	const records = readRiskRecords({ folder })
	const effortClass = CLASS_OF_EFFORT[effort]
	// the class derived now replaces the last derived line, never adds to it: `lot risk` and the snapshot agree (D31)
	const derivedClass = params.derivedNow ?? records.derived.at(-1)?.class
	const lineClass = records.effort.at(-1)?.class
	const highest =
		highestRiskClass({ classes: [effortClass, derivedClass, lineClass] }) ?? effortClass
	return {
		cap: roundsOfClass({ riskClass: highest }),
		effort,
		class: highest,
		raisedBy: raisedByOf({ highest, effortClass, derivedClass }),
	}
}

/** The highest of the classes given (undefined ones left out); undefined when none is given. */
export function highestRiskClass(params: {
	classes: ReadonlyArray<RiskClass | undefined>
}): RiskClass | undefined {
	return params.classes.reduce<RiskClass | undefined>(function higherClass(current, other) {
		if (other === undefined) return current
		return current === undefined || classRank(other) > classRank(current) ? other : current
	}, undefined)
}

/** Whether the class of `effort` is below `riskClass`. */
export function isEffortBelow(params: { effort: Effort; riskClass: RiskClass }): boolean {
	return classRank(CLASS_OF_EFFORT[params.effort]) < classRank(params.riskClass)
}

/** The review rounds a class allows: the cap of its effort. */
export function roundsOfClass(params: { riskClass: RiskClass }): number {
	return REVIEW_ROUND_CAPS[effortOfClass(params)]
}

/** What raised the class above the effort's: the derived line on a tie, undefined when nothing did. */
function raisedByOf(params: {
	highest: RiskClass
	effortClass: RiskClass
	derivedClass: RiskClass | undefined
}): RiskCap['raisedBy'] {
	if (params.highest === params.effortClass) return undefined
	return params.derivedClass === params.highest ? 'derived' : 'effort-class'
}

/** The rank of a class, lowest first. */
function classRank(riskClass: RiskClass): number {
	return RISK_CLASSES.indexOf(riskClass)
}

/** The effort whose class is the given class (the inverse of `CLASS_OF_EFFORT`). */
export function effortOfClass(params: { riskClass: RiskClass }): Effort {
	const effort = efforts().find(function hasClass(candidate) {
		return CLASS_OF_EFFORT[candidate] === params.riskClass
	})
	if (effort === undefined) throw new Error(`no effort of class ${params.riskClass}`)
	return effort
}

/** The efforts, in the order `CLASS_OF_EFFORT` lists them. */
function efforts(): Effort[] {
	return Object.keys(CLASS_OF_EFFORT) as Effort[]
}

/** The line a record is written as: its JSON and `\n`, in UTF-8 (what the limit counts). */
function lineBufferOf(params: { line: RiskLine }): Buffer {
	return Buffer.from(`${JSON.stringify(params.line)}\n`, 'utf8')
}

/**
 * A derived line that fits the line limit: the line itself when it fits, else the first reasons that fit and a last
 * `{ kind: "more", detail: "<n> more" }` reason.
 */
function fittingDerivedLine(params: { line: RiskDerivedLine }): RiskDerivedLine {
	const { line } = params
	if (lineBufferOf({ line }).length <= RISK_LINE_LIMIT) return line
	let kept = 0
	while (
		kept < line.reasons.length &&
		lineBufferOf({ line: cutDerivedLine({ line, kept: kept + 1 }) }).length <= RISK_LINE_LIMIT
	)
		kept += 1
	return cutDerivedLine({ line, kept })
}

/** A derived line holding its first `kept` reasons and a last reason naming how many more there were. */
function cutDerivedLine(params: { line: RiskDerivedLine; kept: number }): RiskDerivedLine {
	const { line, kept } = params
	return {
		...line,
		reasons: [
			...line.reasons.slice(0, kept),
			{ kind: 'more', detail: `${line.reasons.length - kept} more` },
		],
	}
}

/** The risk line a text holds: an effort or derived line of this schema with valid fields; undefined otherwise. */
function parseRiskLine(params: { text: string }): RiskLine | undefined {
	let value: unknown
	try {
		value = JSON.parse(params.text)
	} catch {
		return undefined
	}
	if (!isRecord(value) || value.schema !== RISK_SCHEMA) return undefined
	if (value.kind === 'effort') return effortLineOf({ value })
	if (value.kind === 'derived') return derivedLineOf({ value })
	return undefined
}

/** The effort line a parsed object holds; undefined when a field is missing or of the wrong type. */
function effortLineOf(params: { value: Record<string, unknown> }): RiskEffortLine | undefined {
	const { at, effort, class: riskClass, by, reason } = params.value
	if (typeof at !== 'string' || !isEffort(effort) || typeof by !== 'string') return undefined
	if (riskClass !== undefined && !isRiskClass(riskClass)) return undefined
	if (reason !== undefined && typeof reason !== 'string') return undefined
	return {
		schema: RISK_SCHEMA,
		kind: 'effort',
		at,
		effort,
		...(riskClass === undefined ? {} : { class: riskClass }),
		by,
		...(reason === undefined ? {} : { reason }),
	}
}

/** The derived line a parsed object holds; undefined when a field is missing or of the wrong type. */
function derivedLineOf(params: { value: Record<string, unknown> }): RiskDerivedLine | undefined {
	const { at, class: riskClass, reasons, from } = params.value
	if (typeof at !== 'string' || !isRiskClass(riskClass) || !isDerivedFrom(from)) return undefined
	if (!Array.isArray(reasons)) return undefined
	const parsedReasons = reasons.map(function reasonOfValue(reason: unknown) {
		return reasonOf({ value: reason })
	})
	if (parsedReasons.some(isMissing)) return undefined
	return {
		schema: RISK_SCHEMA,
		kind: 'derived',
		at,
		class: riskClass,
		reasons: parsedReasons as RiskReason[],
		from,
	}
}

/** The reason a parsed value holds; undefined when a field is missing or of the wrong type. */
function reasonOf(params: { value: unknown }): RiskReason | undefined {
	if (!isRecord(params.value)) return undefined
	const { kind, file, line, detail } = params.value
	if (!isReasonKind(kind) || typeof detail !== 'string') return undefined
	if (file !== undefined && typeof file !== 'string') return undefined
	if (line !== undefined && !Number.isInteger(line)) return undefined
	return {
		kind,
		...(file === undefined ? {} : { file }),
		...(line === undefined ? {} : { line: line as number }),
		detail,
	}
}

/** Whether a parsed reason is missing (a reason that did not read). */
function isMissing(reason: RiskReason | undefined): boolean {
	return reason === undefined
}

/** Whether a value is an effort. */
export function isEffort(value: unknown): value is Effort {
	return typeof value === 'string' && (efforts() as string[]).includes(value)
}

/** Whether a value is a risk class. */
export function isRiskClass(value: unknown): value is RiskClass {
	return typeof value === 'string' && (RISK_CLASSES as readonly string[]).includes(value)
}

/** Whether a value is a reason kind. */
function isReasonKind(value: unknown): value is RiskReason['kind'] {
	return typeof value === 'string' && (RISK_REASON_KINDS as readonly string[]).includes(value)
}

/** Whether a value names where a derived line was made. */
function isDerivedFrom(value: unknown): value is RiskDerivedLine['from'] {
	return typeof value === 'string' && (RISK_DERIVED_FROM as readonly string[]).includes(value)
}

/** Whether a parsed value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
