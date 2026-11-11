import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { createPlanWorkspace, marksFileOf } from '../../../test/plan-facts.ts'
import { writeRecordFile } from '../../../test/store-records.ts'
import { appendPlanMark, readPlanMarks } from './plan-marks.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlanMark } from './plan.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const FIRST_TIME = new Date('2026-11-10T08:00:00.000Z')
const SECOND_TIME = new Date('2026-11-10T09:30:00.000Z')

/** A workspace with the plan file written. */
function workspaceWithPlan(name = 'plan.md'): {
	state: string
	planPath: string
	root: string
	planFolder: string
} {
	const workspace = createPlanWorkspace()
	const planPath = writeRecordFile({ folder: workspace.planFolder, name, text: '# plan\n' })
	return { ...workspace, planPath }
}

function lineOf(params: {
	plan: string
	id: string
	by: string
	reason: string | null
	at: Date
}): string {
	return `${JSON.stringify({
		plan: params.plan,
		id: params.id,
		state: 'done',
		by: params.by,
		reason: params.reason,
		at: params.at.toISOString(),
	})}\n`
}

describe('appendPlanMark: one line per mark in the state folder', () => {
	it('one mark -> one line { plan, id, state, by, reason, at } in <state>/dialecte/plans/<16 hex>.jsonl', () => {
		const workspace = workspaceWithPlan()
		expect(
			appendPlanMark({
				planPath: workspace.planPath,
				id: 'K0',
				by: 'person-a',
				reason: 'done on paper',
				now: FIRST_TIME,
			}),
		).toBeUndefined()
		expect(
			readFileSync(marksFileOf({ state: workspace.state, planPath: workspace.planPath }), 'utf8'),
		).toBe(
			lineOf({
				plan: realpathSync(workspace.planPath),
				id: 'K0',
				by: 'person-a',
				reason: 'done on paper',
				at: FIRST_TIME,
			}),
		)
	})

	it('the marks file is named by 16 hex digits and lives in plans/', () => {
		const workspace = workspaceWithPlan()
		expect(
			appendPlanMark({ planPath: workspace.planPath, id: 'K0', by: 'person-a', now: FIRST_TIME }),
		).toBeUndefined()
		expect(readdirSync(join(workspace.state, 'dialecte', 'plans'))).toEqual([
			expect.stringMatching(/^[0-9a-f]{16}\.jsonl$/),
		])
	})

	it('no reason -> reason null', () => {
		const workspace = workspaceWithPlan()
		expect(
			appendPlanMark({ planPath: workspace.planPath, id: 'K0', by: 'person-a', now: FIRST_TIME }),
		).toBeUndefined()
		expect(
			readFileSync(marksFileOf({ state: workspace.state, planPath: workspace.planPath }), 'utf8'),
		).toBe(
			lineOf({
				plan: realpathSync(workspace.planPath),
				id: 'K0',
				by: 'person-a',
				reason: null,
				at: FIRST_TIME,
			}),
		)
	})

	it('a second mark -> a second line, the first kept', () => {
		const workspace = workspaceWithPlan()
		const first = {
			planPath: workspace.planPath,
			id: 'K0',
			by: 'person-a',
			now: FIRST_TIME,
		}
		expect(appendPlanMark(first)).toBeUndefined()
		expect(
			appendPlanMark({ planPath: workspace.planPath, id: 'K1', by: 'reviewer', now: SECOND_TIME }),
		).toBeUndefined()
		expect(
			readFileSync(marksFileOf({ state: workspace.state, planPath: workspace.planPath }), 'utf8'),
		).toBe(
			lineOf({
				plan: realpathSync(workspace.planPath),
				id: 'K0',
				by: 'person-a',
				reason: null,
				at: FIRST_TIME,
			}) +
				lineOf({
					plan: realpathSync(workspace.planPath),
					id: 'K1',
					by: 'reviewer',
					reason: null,
					at: SECOND_TIME,
				}),
		)
	})

	it('a location names the state folder instead of the environment', () => {
		const workspace = workspaceWithPlan()
		const elsewhere = join(workspace.root, 'elsewhere')
		expect(
			appendPlanMark({
				planPath: workspace.planPath,
				id: 'K0',
				by: 'person-a',
				now: FIRST_TIME,
				location: { environment: { XDG_STATE_HOME: elsewhere } },
			}),
		).toBeUndefined()
		expect(
			readFileSync(marksFileOf({ state: elsewhere, planPath: workspace.planPath }), 'utf8'),
		).toMatch(/"id":"K0"/)
	})
})

describe('readPlanMarks: this plan, in the order appended', () => {
	it('marks written by hand are read back', () => {
		const workspace = workspaceWithPlan()
		const plan = realpathSync(workspace.planPath)
		const marks: PlanMark[] = [
			{
				plan,
				id: 'K0',
				state: 'done',
				by: 'person-a',
				reason: 'on paper',
				at: FIRST_TIME.toISOString(),
			},
			{
				plan,
				id: 'K1',
				state: 'done',
				by: 'reviewer',
				reason: null,
				at: SECOND_TIME.toISOString(),
			},
		]
		const file = marksFileOf({ state: workspace.state, planPath: workspace.planPath })
		writeRecordFile({
			folder: dirname(file),
			name: basename(file),
			text: marks.map((mark) => `${JSON.stringify(mark)}\n`).join(''),
		})
		expect(readPlanMarks({ planPath: workspace.planPath })).toEqual(marks)
	})

	it('no marks file -> no marks', () => {
		const workspace = workspaceWithPlan()
		expect(readPlanMarks({ planPath: workspace.planPath })).toEqual([])
	})

	it('a mark appended is read back', () => {
		const workspace = workspaceWithPlan()
		expect(
			appendPlanMark({
				planPath: workspace.planPath,
				id: 'K0',
				by: 'person-a',
				reason: 'done on paper',
				now: FIRST_TIME,
			}),
		).toBeUndefined()
		expect(readPlanMarks({ planPath: workspace.planPath })).toEqual([
			{
				plan: realpathSync(workspace.planPath),
				id: 'K0',
				state: 'done',
				by: 'person-a',
				reason: 'done on paper',
				at: FIRST_TIME.toISOString(),
			},
		])
	})

	it('the marks of another plan are not returned', () => {
		const workspace = workspaceWithPlan()
		const other = writeRecordFile({
			folder: workspace.planFolder,
			name: 'other.md',
			text: '# other\n',
		})
		expect(
			appendPlanMark({ planPath: other, id: 'X1', by: 'person-a', now: FIRST_TIME }),
		).toBeUndefined()
		expect(
			appendPlanMark({ planPath: workspace.planPath, id: 'K0', by: 'person-a', now: SECOND_TIME }),
		).toBeUndefined()
		expect(readPlanMarks({ planPath: workspace.planPath }).map((mark) => mark.id)).toEqual(['K0'])
	})

	it('two plans make two marks files', () => {
		const workspace = workspaceWithPlan()
		const other = writeRecordFile({
			folder: workspace.planFolder,
			name: 'other.md',
			text: '# other\n',
		})
		expect(
			appendPlanMark({ planPath: other, id: 'X1', by: 'person-a', now: FIRST_TIME }),
		).toBeUndefined()
		expect(
			appendPlanMark({ planPath: workspace.planPath, id: 'K0', by: 'person-a', now: SECOND_TIME }),
		).toBeUndefined()
		expect(readdirSync(join(workspace.state, 'dialecte', 'plans'))).toHaveLength(2)
	})

	it('the marks of a location are the ones read through it', () => {
		const workspace = workspaceWithPlan()
		const elsewhere = join(workspace.root, 'elsewhere')
		const location = { environment: { XDG_STATE_HOME: elsewhere } }
		expect(
			appendPlanMark({
				planPath: workspace.planPath,
				id: 'K0',
				by: 'person-a',
				now: FIRST_TIME,
				location,
			}),
		).toBeUndefined()
		expect(
			readPlanMarks({ planPath: workspace.planPath, location }).map((mark) => mark.id),
		).toEqual(['K0'])
	})
})
