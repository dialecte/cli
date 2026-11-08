/**
 * The transitions of a lot: `transitions/<seq>.json`, `seq` zero-padded to six digits, each published once and
 * read-only. The current position is the highest number; two writers never both publish the same one.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { publishOnce, recordText, storeRefusal } from './publish.ts'
import {
	NUMBER_LOCALE,
	RECORD_EXTENSION,
	STORE_FILES,
	TRANSITION_CEILING,
	TRANSITION_FILE_PATTERN,
	TRANSITION_NUMBER_WIDTH,
} from './store.constants.ts'

import type { InterleavingSeam } from '../handover/handover.types.ts'
import type { Transition, TransitionDraft } from './store.types.ts'

/** The transitions of a lot, by number; only strict names count (`^\d{6}\.json$`). */
export function readTransitions(params: { lotFolder: string }): Transition[] {
	return transitionNumbersOf(params).flatMap(function recordOf(seq): Transition[] {
		try {
			return [
				JSON.parse(
					readFileSync(transitionPathOf({ lotFolder: params.lotFolder, seq }), 'utf8'),
				) as Transition,
			]
		} catch {
			return []
		}
	})
}

/**
 * Publishes the next transition: `next` gets the last one (undefined for the first) and returns the record
 * without its number; the number is the highest + 1. When another writer took the number first, the last
 * transition is read again and `next` decides again. Refuses to publish number 1,000,000.
 */
export function appendTransition(params: {
	lotFolder: string
	next: (params: { last: Transition | undefined }) => TransitionDraft
	/** Called once, after the first read of the last transition and before its publish. */
	afterRead?: InterleavingSeam
}): Transition {
	mkdirSync(join(params.lotFolder, STORE_FILES.transitions), { recursive: true })
	let seam = params.afterRead
	for (;;) {
		const highest = transitionNumbersOf(params).at(-1) ?? 0
		const seq = highest + 1
		if (seq > TRANSITION_CEILING)
			throw storeRefusal(
				`the lot ${params.lotFolder} holds transition ${TRANSITION_CEILING.toLocaleString(NUMBER_LOCALE)}: a transition ${seq.toLocaleString(NUMBER_LOCALE)} is refused`,
			)
		const last = readTransitions(params).at(-1)
		const transition: Transition = { seq, ...params.next({ last }) }
		seam?.()
		seam = undefined
		const published = publishOnce({
			path: transitionPathOf({ lotFolder: params.lotFolder, seq }),
			text: recordText(transition),
			readOnly: true,
		})
		if (published) return transition
	}
}

/** The path of transition `seq` of a lot folder. */
export function transitionPathOf(params: { lotFolder: string; seq: number }): string {
	return join(
		params.lotFolder,
		STORE_FILES.transitions,
		`${String(params.seq).padStart(TRANSITION_NUMBER_WIDTH, '0')}${RECORD_EXTENSION}`,
	)
}

/** The numbers of the transitions published in a lot folder, ascending. */
function transitionNumbersOf(params: { lotFolder: string }): number[] {
	const folder = join(params.lotFolder, STORE_FILES.transitions)
	if (!existsSync(folder)) return []
	return readdirSync(folder)
		.filter((name) => TRANSITION_FILE_PATTERN.test(name))
		.map((name) => Number.parseInt(name, 10))
		.sort((first, second) => first - second)
}
