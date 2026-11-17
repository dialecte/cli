/**
 * Stacks for dependent lots (33CI CI4): a lot started on another open lot (`lot start --on <parent>`) records the parent
 * and the parent's tip it sits on in `stack.json`; landing and closing read it.
 */
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { tryReadGit } from '../git.ts'
import { readLanding } from '../handover/land-record.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { replaceWhole } from './publish.ts'
import { requiredLotOf } from './resolve-lot.ts'
import {
	STACK_FILE,
	STACK_PARENT_REFUSALS,
	STACK_ROUTES,
	STACK_SCHEMA,
	STACK_TEXT,
	STACKABLE_STATES,
} from './stack.constants.ts'

import type { StackParent, StackRecord } from './stack.types.ts'

/**
 * The open lot `argument` names as the parent of a lot of `repository`: its folder, name, branch and branch tip; the
 * refusal line when it names no lot, a damaged one, one no longer at work, one of another repository, or one whose
 * branch the repository does not hold.
 *
 * @intent start a lot on another open lot's branch
 * @internal
 */
export function resolveStackParent(params: {
	argument: string
	repository: string
}): StackParent | { refusal: string } {
	const { argument, repository } = params
	function fill(template: string): string {
		return template.replaceAll('{lot}', () => argument)
	}
	const required = requiredLotOf({ argument, cwd: repository, mode: 'read' })
	if (!('lot' in required)) return { refusal: fill(STACK_PARENT_REFUSALS.unknown) }
	const lotFolder = required.lot
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined || !('input' in checked))
		return { refusal: fill(STACK_PARENT_REFUSALS.damaged) }
	const { state } = lotState(checked.input)
	if (!STACKABLE_STATES.includes(state))
		return { refusal: fill(STACK_PARENT_REFUSALS.state).replace('{state}', state) }
	const { identity } = checked.input
	const own = realPathOf(repository)
	if (realPathOf(identity.repository) !== own)
		return {
			refusal: fill(STACK_PARENT_REFUSALS.repository)
				.replace('{parent}', () => identity.repository)
				.replace('{repository}', () => own),
		}
	const head = tryReadGit({
		root: repository,
		args: ['rev-parse', '--verify', '--quiet', `refs/heads/${identity.branch}^{commit}`],
	})?.trim()
	if (head === undefined || head === '')
		return {
			refusal: fill(STACK_PARENT_REFUSALS.noBranch)
				.replace('{branch}', () => identity.branch)
				.replace('{repository}', () => own),
		}
	return { lotFolder, name: basename(lotFolder), branch: identity.branch, head }
}

/**
 * The lot's stack record; undefined when it has none (not stacked) or it does not read as one.
 *
 * @intent read which lot a lot was started on
 * @internal
 */
export function readStack(params: { lotFolder: string }): StackRecord | undefined {
	let value: unknown
	try {
		value = JSON.parse(readFileSync(join(params.lotFolder, STACK_FILE), 'utf8'))
	} catch {
		return undefined
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
	const record = value as Record<string, unknown>
	if (record.schema !== STACK_SCHEMA) return undefined
	const { parent, parentHead, at, route } = record
	if (![parent, parentHead, at].every((field) => typeof field === 'string' && field !== ''))
		return undefined
	const known = typeof route === 'string' && STACK_ROUTES.includes(route) ? route : undefined
	return {
		schema: STACK_SCHEMA,
		parent,
		parentHead,
		at,
		...(known !== undefined && { route: known }),
	} as StackRecord
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
