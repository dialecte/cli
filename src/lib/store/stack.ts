/**
 * Stacks for dependent lots (33CI CI4, FIX-ci-loop section 1): a lot started on another open lot (`lot start --on
 * <parent>`) records the parent in `stack.json`, nothing else: where it forks and what it lands on are read from git
 * (`lotBaseOf`), the parent's landing through the one lot reader (`readLotLanding`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { readLanding } from '../handover/land-record.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { replaceWhole } from './publish.ts'
import {
	STACK_DAMAGE,
	STACK_FILE,
	STACK_CHANGE_REQUEST_STATES,
	STACK_SCHEMA,
	STACK_TEXT,
} from './stack.constants.ts'

import type { ChangeRequest } from '../host/host.types.ts'
import type { StackDamage, StackRecord } from './stack.types.ts'

/**
 * The lot's stack record; undefined when it has none (not stacked); its damage when the file does not read as one (torn,
 * or another shape): never read as not stacked. Fields beyond the parent are not read.
 *
 * @intent read which lot a lot was started on
 * @internal
 */
export function readStack(params: { lotFolder: string }): StackRecord | StackDamage | undefined {
	const path = join(params.lotFolder, STACK_FILE)
	if (!existsSync(path)) return undefined
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return { damage: STACK_DAMAGE }
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		return { damage: STACK_DAMAGE }
	const { schema, parent } = value as Record<string, unknown>
	if (schema !== STACK_SCHEMA || typeof parent !== 'string' || parent === '')
		return { damage: STACK_DAMAGE }
	return { schema: STACK_SCHEMA, parent }
}

/**
 * The lot's stack record when it reads as one; undefined when it has none or it is damaged (a reader that only shows
 * what a stack adds, such as the pull request's depends-on part).
 *
 * @intent read a stack record a reader may skip when damaged
 * @internal
 */
export function readStackRecord(params: { lotFolder: string }): StackRecord | undefined {
	const read = readStack(params)
	return read === undefined || 'damage' in read ? undefined : read
}

/**
 * How the hand-over card names the lot a lot was started on, files only: `on <parent> (#<pr>)`, its pull request from
 * the parent's `landing.json`, or `on <parent> (no pull request yet)`; the damage of a stack.json that does not read;
 * undefined for a lot not stacked. `lot status` names the pull request's state too, through the one lot reader
 * (`statusLandingOf`).
 *
 * @intent show which lot a stacked lot lands on, from files
 * @internal
 */
export function stackTextOf(params: { lotFolder: string }): string | undefined {
	const record = readStack(params)
	if (record === undefined) return undefined
	if ('damage' in record)
		return fillMessage({ template: STACK_TEXT.damagedRecord, values: { damage: record.damage } })
	const number = readLanding({ lotFolder: join(dirname(params.lotFolder), record.parent) })?.number
	return stackLineText({ parent: record.parent, number, state: undefined })
}

/**
 * The stack line's text: `on <parent> (#<pr>, <state>)`, `on <parent> (#<pr>)` without a state, `on <parent> (no pull
 * request yet)` without a pull request.
 *
 * @intent write the stack line one way for the card and lot status
 * @internal
 */
export function stackLineText(params: {
	parent: string
	number: number | undefined
	state: string | undefined
}): string {
	const { parent, number, state } = params
	if (number === undefined)
		return fillMessage({ template: STACK_TEXT.noChangeRequest, values: { parent } })
	const changeRequest = `#${number}`
	return state === undefined
		? fillMessage({ template: STACK_TEXT.filesOnly, values: { parent, changeRequest } })
		: fillMessage({ template: STACK_TEXT.withState, values: { parent, changeRequest, state } })
}

/**
 * A pull request's state as the stack line names it: merged, closed, queued, draft or open.
 *
 * @intent name where a parent's pull request stands
 * @internal
 */
export function changeRequestStateOf(changeRequest: ChangeRequest): string {
	if (changeRequest.state !== 'open') return STACK_CHANGE_REQUEST_STATES[changeRequest.state]
	if (changeRequest.queued) return STACK_CHANGE_REQUEST_STATES.queued
	return changeRequest.draft ? STACK_CHANGE_REQUEST_STATES.draft : STACK_CHANGE_REQUEST_STATES.open
}

/**
 * Writes the lot's stack record whole (a crash never leaves half of it).
 *
 * @intent record which lot a lot was started on
 * @internal
 */
export function writeStack(params: { lotFolder: string; record: StackRecord }): void {
	replaceWhole({
		path: join(params.lotFolder, STACK_FILE),
		text: `${JSON.stringify(params.record, null, 2)}\n`,
	})
}
