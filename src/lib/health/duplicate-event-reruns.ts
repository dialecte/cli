import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { CHECK_STEPS, DUPLICATE_RED_MS, DUPLICATE_TEXTS, NO_REUSE } from './health.constants.ts'
import { eventKeyOf, isInWindow, runDurationMs } from './record-run.ts'
import { keyValues, shortHash } from './short-hash.ts'

import type { LotEvent } from '../events/event.types.ts'
import type { DuplicateWorkInput, EndIdentity, HealthFinding, LotRun } from './health.types.ts'

/**
 * Each check step that ran again (not answered from a record) with the same state and the same key as an earlier
 * passed end of that step, in any lot of the repository; an end a store-pair finding already names, and an end of a
 * run given `--no-reuse` (a deliberate re-run), are left out.
 */
export function findEventReruns(
	params: DuplicateWorkInput & { namedEnds: ReadonlySet<LotEvent> },
): HealthFinding[] {
	const { repository, window, runs, namedEnds } = params
	const findings: HealthFinding[] = []
	// the latest passed end of each step, state and key seen so far: the ends come in time order
	const latest = new Map<string, LotRun>()
	for (const run of runs) {
		const { end } = run
		const { step, stateHash } = end
		const key = eventKeyOf({ event: end })
		if (typeof step !== 'string' || !CHECK_STEPS.has(step) || end.exit !== 0) continue
		if (typeof stateHash !== 'string' || key === undefined) continue
		const identity = identityOf({ step, stateHash, key })
		const first = latest.get(identity)
		if (
			first !== undefined &&
			end.reuse === NO_REUSE &&
			end.noReuse !== true &&
			isInWindow({ at: end.at, ...window }) &&
			!namedEnds.has(end)
		) {
			findings.push(
				eventRerunFinding({
					repository: repository.name,
					first: first.end,
					again: run,
					identity: { step, stateHash, key },
				}),
			)
		}
		latest.set(identity, run)
	}
	return findings
}

/** One text per step, state hash and key: two ends of the same identity checked the same thing. */
function identityOf(params: EndIdentity): string {
	const { step, stateHash, key } = params
	return JSON.stringify([step, stateHash, key.tree, key.lockHash, key.commandHash, key.linked])
}

function eventRerunFinding(params: {
	repository: string
	first: LotEvent
	again: LotRun
	identity: EndIdentity
}): HealthFinding {
	const { repository, first, again } = params
	const { step, stateHash, key } = params.identity
	const { end } = again
	const durationMs = runDurationMs({ run: again })
	return {
		rule: 'duplicate-work',
		severity: durationMs >= DUPLICATE_RED_MS ? 'red' : 'amber',
		repository,
		lot: again.lot,
		at: end.at,
		text: fillMessage({
			template: DUPLICATE_TEXTS.eventRerun,
			values: {
				state: shortHash(stateHash),
				step,
				duration: formatDuration(durationMs),
				firstAt: first.at,
			},
		}),
		detail: [fillMessage({ template: DUPLICATE_TEXTS.keyLine, values: keyValues(key) })],
	}
}
