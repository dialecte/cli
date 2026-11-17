/**
 * Stacks for dependent lots (33CI CI4): a lot started on another open lot (`lot start --on <parent>`) records the parent
 * and the parent's tip it sits on in `stack.json`; landing and closing read it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { readLanding } from '../handover/land-record.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { replaceWhole } from './publish.ts'
import {
	STACK_DAMAGE,
	STACK_FILE,
	STACK_ROUTES,
	STACK_SCHEMA,
	STACK_TEXT,
} from './stack.constants.ts'

import type { StackDamage, StackRecord } from './stack.types.ts'

/**
 * The lot's stack record; undefined when it has none (not stacked); its damage when the file does not read as one (torn,
 * or another shape): never read as not stacked.
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
	const record = value as Record<string, unknown>
	const { parent, parentHead, at, route } = record
	if (
		record.schema !== STACK_SCHEMA ||
		![parent, parentHead, at].every((field) => typeof field === 'string' && field !== '') ||
		(route !== undefined && (typeof route !== 'string' || !STACK_ROUTES.includes(route)))
	)
		return { damage: STACK_DAMAGE }
	return {
		schema: STACK_SCHEMA,
		parent,
		parentHead,
		at,
		...(route !== undefined && { route }),
	} as StackRecord
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
 * How a lot names the lot it was started on: `on <parent> (#<pr>, <state>)` (the parent's pull request from its
 * `landing.json`, its state from its records); undefined for a lot not stacked. Files only.
 *
 * @intent show which lot a stacked lot lands on
 * @internal
 */
export function stackTextOf(params: { lotFolder: string }): string | undefined {
	const record = readStack(params)
	if (record === undefined) return undefined
	if ('damage' in record) return STACK_TEXT.damagedRecord.replace('{damage}', () => record.damage)
	const parentFolder = join(dirname(params.lotFolder), record.parent)
	const number = readLanding({ lotFolder: parentFolder })?.number
	const checked = readCheckedLotState({
		lotFolder: parentFolder,
		registry: registryOfLotFolder(parentFolder),
	})
	const state =
		checked === undefined
			? STACK_TEXT.unknown
			: 'input' in checked
				? lotState(checked.input).state
				: STACK_TEXT.damaged
	return STACK_TEXT.line
		.replace('{parent}', () => record.parent)
		.replace('{pull}', number === undefined ? STACK_TEXT.noPull : `#${number}`)
		.replace('{state}', state)
}

/**
 * Writes the lot's stack record whole (a crash never leaves half of it).
 *
 * @intent record which lot a lot was started on, and the tip it sits on
 * @internal
 */
export function writeStack(params: { lotFolder: string; record: StackRecord }): void {
	replaceWhole({
		path: join(params.lotFolder, STACK_FILE),
		text: `${JSON.stringify(params.record, null, 2)}\n`,
	})
}
