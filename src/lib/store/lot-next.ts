/** The exact next command of a lot (33S section 7, D18), with its full name: one rule for `start` and `status`. */
import { NEXT_COMMANDS } from './store.constants.ts'

import type { LotStateInput, LotStateReport, NextCommands } from './store.types.ts'

/** The manual line: what a real working lot asks for while no runner exists (S). */
export function manualNextOf(name: string): string {
	return NEXT_COMMANDS.manual.replace('{name}', name)
}

/** The stop line: what a failed lot asks for. */
export function failedNextOf(name: string): string {
	return NEXT_COMMANDS.stop.replace('{name}', name)
}

/**
 * `next` and `also` per state: working -> the manual line (the wait line when simulated); input-required -> the
 * answer line of the first open question; ready -> show and run the pending hand-over, or `lot result` without one;
 * failed -> the stop line; committed and canceled -> none.
 */
export function nextCommandsOf(params: {
	input: LotStateInput
	report: LotStateReport
}): NextCommands {
	const { input, report } = params
	const name = input.identity.name
	const handover = input.registryEntry?.state === 'pending' ? input.registryEntry.name : undefined
	if (report.state === 'working')
		return {
			next: input.identity.simulated
				? NEXT_COMMANDS.simulated.replace('{name}', name)
				: manualNextOf(name),
			also: [],
		}
	if (report.state === 'input-required')
		return {
			next: NEXT_COMMANDS.answer
				.replace('{name}', name)
				.replace('{question}', report.openQuestions[0]?.id ?? ''),
			also: [],
		}
	if (report.state === 'ready' && handover !== undefined)
		return {
			next: NEXT_COMMANDS.show.replace('{handover}', handover),
			also: [NEXT_COMMANDS.run.replace('{handover}', handover)],
		}
	if (report.state === 'ready')
		return { next: NEXT_COMMANDS.result.replace('{name}', name), also: [] }
	if (report.state === 'failed') return { next: failedNextOf(name), also: [] }
	return { next: null, also: [] }
}
