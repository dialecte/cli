/**
 * A `step.end` event that fits one line (33L0 section 4, "Compact parts and their cut", D14): parts are compacted
 * first; when the line still holds more than 40 parts or passes 4,096 bytes, every failing part that can be is named
 * (name and status), then the room left goes to details, failing parts first, then passing ones, by position; a part
 * that does not fit is skipped, and the event says what was left out.
 */
import { CUT_LIST_LIMIT, EVENT_LINE_LIMIT } from './events.constants.ts'
import { FAILED_PART_STATUS } from './record-step.constants.ts'
import { cutEvent, eventLineOf } from './write-event.ts'

import type { LotEvent } from './event.types.ts'
import type { StepPart } from './record-step.types.ts'

/** The event with its parts compacted, cut to fit when they must be: never a failing part hidden by a passing one. */
export function fitParts(params: { event: LotEvent; parts: readonly StepPart[] }): LotEvent {
	const compact = params.parts.map(compactPart)
	const whole = cutEvent({ event: { ...params.event, parts: compact } })
	if (compact.length <= CUT_LIST_LIMIT && fits(whole)) return whole
	const failing = compact.filter(isFailing)
	const order = [...failing, ...compact.filter(isPassing)]
	const totals = { cut: true, partsTotal: compact.length, partsFailedTotal: failing.length }
	let kept = new Map<Record<string, unknown>, Record<string, unknown>>()
	let fitted = cutEvent({ event: { ...params.event, parts: [], ...totals } })
	/** Keeps `part` as `form` when the event then fits, its earlier form otherwise. */
	function keepWhenFits(attempt: {
		part: Record<string, unknown>
		form: Record<string, unknown>
	}): void {
		const next = new Map([...kept, [attempt.part, attempt.form]])
		const candidate = cutEvent({
			event: { ...params.event, parts: compact.flatMap(formsIn(next)), ...totals },
		})
		if (!fits(candidate)) return
		kept = next
		fitted = candidate
	}
	// the names first: details never take the room of a failing part's name
	for (const part of failing) {
		if (kept.size === CUT_LIST_LIMIT) break
		keepWhenFits({ part, form: { name: part.name, status: part.status } })
	}
	// then the room left, part by part; one that does not fit is skipped, never the end of the fit
	for (const part of order) {
		if (kept.has(part) || kept.size < CUT_LIST_LIMIT) keepWhenFits({ part, form: part })
	}
	return fitted
}

/** A part without the keys whose value is the default: null, false or an empty list (readers default them). */
function compactPart(part: StepPart): Record<string, unknown> {
	const compact: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(part)) if (!isDefault(value)) compact[key] = value
	return compact
}

/** True for null, false and an empty list. */
function isDefault(value: unknown): boolean {
	return value === null || value === false || (Array.isArray(value) && value.length === 0)
}

/** True for a part that failed. */
function isFailing(part: Record<string, unknown>): boolean {
	return part.status === FAILED_PART_STATUS
}

/** True for a part that did not fail. */
function isPassing(part: Record<string, unknown>): boolean {
	return !isFailing(part)
}

/** The mapper answering each kept part in the form it was kept, none for the others: run order is the caller's. */
function formsIn(
	kept: ReadonlyMap<Record<string, unknown>, Record<string, unknown>>,
): (part: Record<string, unknown>) => Record<string, unknown>[] {
	return function formOf(part) {
		const form = kept.get(part)
		return form === undefined ? [] : [form]
	}
}

/** True when the event's line is within the limit. */
function fits(event: LotEvent): boolean {
	return eventLineOf({ event }).length <= EVENT_LINE_LIMIT
}
