/**
 * Stacks for dependent lots (33CI CI4, FIX-ci-loop section 1): a lot started on another open lot (`lot start --on
 * <parent>`) records the parent in `stack.json`, nothing else: where it forks and what it lands on are read from git
 * (`lotBaseOf`), the parent's pull request from the host.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { readLanding } from '../handover/land-record.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readIdentity } from './identity.ts'
import { commonFolderOfLotFolder } from './lot-records.ts'
import { replaceWhole } from './publish.ts'
import {
	STACK_DAMAGE,
	STACK_FILE,
	STACK_PULL_STATES,
	STACK_SCHEMA,
	STACK_TEXT,
} from './stack.constants.ts'

import type { HostAdapter, PullRequest } from '../host/host.types.ts'
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
 * How a lot names the lot it was started on: `on <parent> (#<pr>, <state>)`, the parent's pull request (its
 * `landing.json`'s, else the host's newest of its branch) and that pull request's state as `host` holds it (open,
 * draft, queued, merged, closed, or why the host cannot say); without a host, files only: `on <parent> (#<pr>)`.
 * Undefined for a lot not stacked.
 *
 * @intent show which lot a stacked lot lands on, and where its parent's pull request stands
 * @internal
 */
export function stackTextOf(params: { lotFolder: string; host?: HostAdapter }): string | undefined {
	const record = readStack(params)
	if (record === undefined) return undefined
	if ('damage' in record)
		return fillMessage({ template: STACK_TEXT.damagedRecord, values: { damage: record.damage } })
	const { parent } = record
	const parentFolder = join(dirname(params.lotFolder), parent)
	const number = readLanding({ lotFolder: parentFolder })?.number
	if (params.host === undefined)
		return number === undefined
			? fillMessage({ template: STACK_TEXT.noPull, values: { parent } })
			: fillMessage({ template: STACK_TEXT.filesOnly, values: { parent, pull: `#${number}` } })
	const branch = readIdentity({ lotFolder: parentFolder })?.branch
	const ref = number === undefined ? branch : String(number)
	const read =
		ref === undefined
			? undefined
			: params.host.readPullRequest({ root: repositoryOf(params.lotFolder), ref })
	if (read !== undefined && 'refusal' in read)
		return number === undefined
			? fillMessage({ template: STACK_TEXT.noPull, values: { parent } })
			: fillMessage({
					template: STACK_TEXT.withState,
					values: {
						parent,
						pull: `#${number}`,
						state: fillMessage({
							template: STACK_TEXT.hostSilent,
							values: { reason: read.refusal },
						}),
					},
				})
	if (read === undefined) return fillMessage({ template: STACK_TEXT.noPull, values: { parent } })
	return fillMessage({
		template: STACK_TEXT.withState,
		values: { parent, pull: `#${read.number}`, state: pullStateOf(read) },
	})
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

/** A pull request's state as the stack line names it: merged, closed, queued, draft or open. */
function pullStateOf(pull: PullRequest): string {
	if (pull.state !== 'open') return STACK_PULL_STATES[pull.state]
	if (pull.queued) return STACK_PULL_STATES.queued
	return pull.draft ? STACK_PULL_STATES.draft : STACK_PULL_STATES.open
}

/** The repository whose store holds `lotFolder`, where the host is asked from (files only, no git). */
function repositoryOf(lotFolder: string): string {
	const common = commonFolderOfLotFolder(lotFolder)
	return basename(common) === '.git' ? dirname(common) : common
}
