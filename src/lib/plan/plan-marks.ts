/**
 * A person's marks on the entries of a plan, kept per machine in the state folder: one JSON line per mark, in a
 * file named by the plan's real path.
 */
import { createHash } from 'node:crypto'
import { closeSync, constants, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { stateFolder } from '../store/state-folder.ts'
import {
	PLAN_MARKS_EXTENSION,
	PLAN_MARKS_FILE_MODE,
	PLAN_MARKS_NAME_LENGTH,
	PLAN_MARKS_SEGMENTS,
} from './plan.constants.ts'

import type { StateFolderLocation } from '../store/store.types.ts'
import type { PlanMark } from './plan.types.ts'

/**
 * Appends one line `{ plan, id, state: 'done', by, reason, at }` to the plan's marks file
 * (`<state>/dialecte/plans/<sha256 of the plan's real path, 16 hex>.jsonl`), one `O_APPEND` write.
 */
export function appendPlanMark(params: {
	planPath: string
	id: string
	by: string
	reason?: string
	location?: StateFolderLocation
	now?: Date
}): void {
	const plan = realPlanPathOf({ planPath: params.planPath })
	const mark: PlanMark = {
		plan,
		id: params.id,
		state: 'done',
		by: params.by,
		reason: params.reason ?? null,
		at: (params.now ?? new Date()).toISOString(),
	}
	const file = marksFileOf({ plan, location: params.location })
	mkdirSync(dirname(file), { recursive: true })
	const descriptor = openSync(
		file,
		constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY,
		PLAN_MARKS_FILE_MODE,
	)
	try {
		writeSync(descriptor, `${JSON.stringify(mark)}\n`)
	} finally {
		closeSync(descriptor)
	}
}

/** The marks of this plan, in the order they were appended; another plan's marks are not returned. */
export function readPlanMarks(params: {
	planPath: string
	location?: StateFolderLocation
}): PlanMark[] {
	const plan = realPlanPathOf({ planPath: params.planPath })
	const text = marksTextOf({ file: marksFileOf({ plan, location: params.location }) })
	return text
		.split('\n')
		.flatMap((line) => markOfLine({ line }))
		.filter((mark) => mark.plan === plan)
}

/** The plan's real path: what its marks are keyed by. */
function realPlanPathOf(params: { planPath: string }): string {
	return realPathOf(resolve(params.planPath))
}

/** `<state>/dialecte/plans/<the first 16 hex of the sha256 of the plan's real path>.jsonl`. */
function marksFileOf(params: { plan: string; location?: StateFolderLocation }): string {
	const digest = createHash('sha256').update(params.plan).digest('hex')
	return join(
		stateFolder(params.location),
		...PLAN_MARKS_SEGMENTS,
		`${digest.slice(0, PLAN_MARKS_NAME_LENGTH)}${PLAN_MARKS_EXTENSION}`,
	)
}

/** The marks file's text; empty when there is none yet. */
function marksTextOf(params: { file: string }): string {
	try {
		return readFileSync(params.file, 'utf8')
	} catch {
		return ''
	}
}

/** The mark of one line; none for an empty line or one that does not hold a mark (a torn write). */
function markOfLine(params: { line: string }): PlanMark[] {
	if (params.line.trim() === '') return []
	try {
		const value = JSON.parse(params.line) as Partial<PlanMark> | null
		if (
			typeof value?.plan !== 'string' ||
			typeof value.id !== 'string' ||
			value.state !== 'done' ||
			typeof value.by !== 'string' ||
			typeof value.at !== 'string'
		)
			return []
		return [
			{
				plan: value.plan,
				id: value.id,
				state: 'done',
				by: value.by,
				reason: typeof value.reason === 'string' ? value.reason : null,
				at: value.at,
			},
		]
	} catch {
		return []
	}
}
