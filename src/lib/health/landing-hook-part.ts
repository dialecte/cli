import { INTERRUPTED_OUTCOME, WHOLE_REUSE } from '../events/unrecorded-steps.constants.ts'
import { isGreenRecord } from '../gate-records/check-records.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { LANDING_TEXTS, RECORD_EVENT_SLACK_MS } from './health.constants.ts'
import { eventKeyOf, runDurationMs, timeOf } from './record-run.ts'
import { shortHash } from './short-hash.ts'

import type { LotEvent } from '../events/event.types.ts'
import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { LandingHookInput, LandingHookPart } from './health.types.ts'

/**
 * What one commit hook of a handover run did: reused whole from its record, or ran for its duration and why -
 * a duplicate-work finding of the lot dated while it ran (or a slack after), killed before its end, no green
 * record of its tree older than its start, or else not reused.
 */
export function landingHookPart(params: LandingHookInput): LandingHookPart {
	const { hook, index } = params
	const { end } = hook
	if (end !== undefined && end.reuse === WHOLE_REUSE) {
		return {
			text: fillMessage({ template: LANDING_TEXTS.hookReused, values: { index: String(index) } }),
			duplicate: false,
		}
	}
	const duplicate = end !== undefined && namesDuplicate({ ...params, end })
	const duration =
		end === undefined
			? LANDING_TEXTS.unknownTime
			: formatDuration(runDurationMs({ run: { ...hook, end } }))
	return {
		text: fillMessage({
			template: LANDING_TEXTS.hookRan,
			values: {
				index: String(index),
				duration,
				reason: duplicate ? LANDING_TEXTS.duplicate : reasonOf({ ...params, end }),
			},
		}),
		duplicate,
	}
}

/** A duplicate-work finding of the lot is dated from the hook's start to `RECORD_EVENT_SLACK_MS` after its end. */
function namesDuplicate(params: LandingHookInput & { end: LotEvent }): boolean {
	const from = timeOf(params.hook.start.at)
	const to = timeOf(params.end.at) + RECORD_EVENT_SLACK_MS
	return params.duplicates.some(function isWhileHookRan(finding) {
		const at = timeOf(finding.at)
		return at >= from && at <= to
	})
}

/** Why a hook that is no duplicate ran: killed, no green record of its tree before it, or not reused. */
function reasonOf(params: LandingHookInput & { end: LotEvent | undefined }): string {
	const { end, hook, recordsByTree } = params
	if (end === undefined || end.outcome === INTERRUPTED_OUTCOME) return LANDING_TEXTS.interrupted
	const key = eventKeyOf({ event: end })
	if (key === undefined) return LANDING_TEXTS.notReused
	const records = recordsByTree.get(key.tree) ?? []
	if (hasGreenBefore({ records, before: timeOf(hook.start.at) })) return LANDING_TEXTS.notReused
	return fillMessage({
		template: LANDING_TEXTS.noGreenRecord,
		values: { tree: shortHash(key.tree) },
	})
}

function hasGreenBefore(params: { records: readonly GateRecord[]; before: number }): boolean {
	return params.records.some(function isGreenBefore(record) {
		return timeOf(record.at) < params.before && isGreenRecord(record)
	})
}
