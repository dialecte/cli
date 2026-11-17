/**
 * A lot knows its plan entry: `lot start` finds the one entry of the plans the machine knows whose branch is the
 * brief's, and records it (`plan-entry.json`: the plan's real path and the id), so every public-text check reads that
 * plan's ids whatever the machine's marks say later.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { VALID_BRIEF } from '../../../test/brief-workspace.constants.ts'
import { briefWith, checkArgumentsOf, createBriefWorkspace } from '../../../test/brief-workspace.ts'
import { createStartWorkspace } from '../../../test/lot-start-workspace.ts'
import { planEntryOf, planWithBlock, writeMarkedPlan } from '../../../test/plan-block.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'
import { checkBrief } from './brief.ts'
import { folderPlanEntryIds } from './public-text.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const BRANCH = String(VALID_BRIEF.branch)

describe('the plan entry of a lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("a marked plan with one entry on the brief's branch → the checked brief names that plan and entry", () => {
		const workspace = createBriefWorkspace()
		const plan = writeMarkedPlan({
			briefFolder: workspace.briefFolder,
			file: 'lot-plan.md',
			lots: [
				planEntryOf({ id: 'SUB1', branch: BRANCH }),
				planEntryOf({ id: 'OTH2', branch: 'feat/other' }),
			],
		})

		const checked = checkBrief(checkArgumentsOf({ workspace, brief: briefWith() })).checked

		expect(checked?.planEntry).toEqual({ plan: realpathSync(plan), id: 'SUB1' })
	})

	it("two entries on the brief's branch → no entry named, never a guess", () => {
		const workspace = createBriefWorkspace()
		writeMarkedPlan({
			briefFolder: workspace.briefFolder,
			file: 'lot-plan.md',
			lots: [
				planEntryOf({ id: 'SUB1', branch: BRANCH }),
				planEntryOf({ id: 'SUB2', branch: BRANCH }),
			],
		})

		const checked = checkBrief(checkArgumentsOf({ workspace, brief: briefWith() })).checked

		expect(checked !== undefined && checked.planEntry === undefined).toBe(true)
	})

	it('lot start → the lot folder holds plan-entry.json with the plan and the id', () => {
		const start = createStartWorkspace()
		const plan = writeMarkedPlan({
			briefFolder: start.workspace.briefFolder,
			file: 'lot-plan.md',
			lots: [planEntryOf({ id: 'SUB1', branch: BRANCH })],
		})

		runLot({ cwd: start.cwd, argv: ['start', start.workspace.briefPath, '--json'] })

		const [lot] = readdirSync(start.store).filter((name) => !name.startsWith('.'))
		expect(existsSync(join(start.store, lot, 'plan-entry.json'))).toBe(true)
		expect(JSON.parse(readFileSync(join(start.store, lot, 'plan-entry.json'), 'utf8'))).toEqual({
			schema: 1,
			plan: realpathSync(plan),
			id: 'SUB1',
		})
	})

	it("a folder's recorded entry → its plan's ids are the lot's, though no mark names that plan", () => {
		const plan = join(temporaryFolder('dialecte-plan-'), 'plan.md')
		writeFileSync(plan, planWithBlock([planEntryOf({ id: 'SUB1', branch: BRANCH })]))
		const folder = temporaryFolder('dialecte-lot-folder-')
		writeFileSync(join(folder, 'plan-entry.json'), JSON.stringify({ schema: 1, plan, id: 'SUB1' }))

		expect([...folderPlanEntryIds({ folder })]).toEqual(['SUB1'])
	})
})
