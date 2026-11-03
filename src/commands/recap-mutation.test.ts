/** `dialecte recap`: the Mutation section, from the runs and the ledger of the hand-over's branch. */
import { rmSync } from 'node:fs'
import { dirname } from 'node:path'

import { recordWith } from '../../test/mutation-agent.ts'
import {
	FOLLOW_UP,
	MERGED_BRANCH,
	RECORDED_REASON,
	SECOND_SURVIVOR_LINE,
	SECOND_SURVIVOR_MUTATION,
} from '../../test/mutation-hooks.constants.ts'
import {
	mergeHandover,
	recapFolderPath,
	recapHeadings,
	recapSection,
	reportRun,
	scheduleSurvivor,
	startRunning,
	startedAt,
	writeHandover,
	writeRecapFolder,
} from '../../test/mutation-hooks.ts'
import { PACKAGE_NAME, SCOPE_FILE } from '../../test/mutation-package.constants.ts'
import { mutationPackage, survivorOf } from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createScratchRepository, isolateGitConfig } from '../../test/scratch-repository.ts'
import { RECORD_MOVER } from '../lib/mutation/mutation.constants.ts'
import { runRecap } from './recap.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const MUTATION_HEADING = '### Mutation'
const FIRST_ITEM = `\`${SCOPE_FILE}:2\` ConditionalExpression: x === 1 -> true`
const SECOND_ITEM = `\`${SCOPE_FILE}:${SECOND_SURVIVOR_LINE}\` ${SECOND_SURVIVOR_MUTATION}`

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The recap of a hand-over on `main` of a repository whose package declares its mutation scope, or not. */
function recapScenario(params: { declared: boolean }): { root: string; recap: () => string } {
	const root = params.declared
		? mutationPackage()
		: createScratchRepository({ 'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n` })
	const folder = recapFolderPath()
	writeRecapFolder({ root, folder })
	return {
		root,
		recap() {
			const result = runRecap({ cwd: dirname(folder), argv: [folder] })
			expect(result.exitCode).toBe(0)
			return result.output
		},
	}
}

describe('recap: the Mutation section', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('runs of the branch, a survivor killed, one scheduled → each run, the item a run moved, the scheduled item with its follow-up', () => {
		const { root, recap } = recapScenario({ declared: true })
		const first = reportRun({
			root,
			survivors: [
				survivorOf({ key: 'k1' }),
				survivorOf({ key: 'k2', line: SECOND_SURVIVOR_LINE, mutation: SECOND_SURVIVOR_MUTATION }),
			],
			counts: { killed: 3, survived: 2, timedOut: 0, noCoverage: 1 },
			now: startedAt(1),
		})
		const second = reportRun({
			root,
			survivors: [
				survivorOf({ key: 'k2', line: SECOND_SURVIVOR_LINE, mutation: SECOND_SURVIVOR_MUTATION }),
			],
			detected: ['k1'],
			tested: ['k1', 'k2'],
			counts: { killed: 4, survived: 1, timedOut: 2, noCoverage: 0 },
			now: startedAt(2),
		})
		scheduleSurvivor({ root, key: 'k2' })
		const running = startRunning({ root, now: startedAt(3) })

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			`- changed run \`${first.runId}\`: 3 killed · 2 survived · 0 timed out · 1 no coverage`,
			`- changed run \`${second.runId}\`: 4 killed · 1 survived · 2 timed out · 0 no coverage`,
			`- changed run \`${running.runId}\`: running`,
			`- ${FIRST_ITEM}: killed by \`${second.runId}\``,
			`- ${SECOND_ITEM}: scheduled for ${FOLLOW_UP}`,
		])
	})

	it('a run of another branch only → absent: No mutation run.', () => {
		const { root, recap } = recapScenario({ declared: true })
		reportRun({ root, branch: 'feat/other', survivors: [survivorOf({ key: 'k1' })] })

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			'No mutation run.',
		])
	})

	it('declared and no run → No mutation run.', () => {
		const { recap } = recapScenario({ declared: true })

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			'No mutation run.',
		])
	})

	it('no dialecte.mutation declaration → No mutation scope declared.', () => {
		const { recap } = recapScenario({ declared: false })

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			'No mutation scope declared.',
		])
	})

	it('the section sits between Checks and Review', () => {
		const { recap } = recapScenario({ declared: true })

		expect(recapHeadings(recap())).toEqual([
			'### Commits',
			'### Tests added',
			'### Checks',
			MUTATION_HEADING,
			'### Review',
			'### Decisions',
			'### Follow-ups',
		])
	})

	it('a hand-over with a merge lot → a run of the merged branch is listed with its scheduled survivor', () => {
		const { root, lotsPath, out } = mergeHandover({})
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		const run = reportRun({ root, branch: MERGED_BRANCH, survivors: [survivorOf({ key: 'k1' })] })
		scheduleSurvivor({ root, key: 'k1' })

		const result = runRecap({ cwd: dirname(out), argv: [out] })

		expect(result.exitCode).toBe(0)
		expect(recapSection({ output: result.output, heading: MUTATION_HEADING })).toEqual([
			`- changed run \`${run.runId}\`: 3 killed · 1 survived · 0 timed out · 0 no coverage`,
			`- ${FIRST_ITEM}: scheduled for ${FOLLOW_UP}`,
		])
	})

	it('a survivor first seen on another branch and scheduled → not listed', () => {
		const { root, recap } = recapScenario({ declared: true })
		reportRun({ root, branch: 'feat/other', survivors: [survivorOf({ key: 'k1' })] })
		scheduleSurvivor({ root, key: 'k1' })

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			'No mutation run.',
		])
	})

	it('the repository gone → No mutation run.', () => {
		const { root, recap } = recapScenario({ declared: true })
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })] })
		rmSync(root, { recursive: true, force: true })
		// the recap reads the user name in the current folder, where git sees only the test's config
		isolateGitConfig({ userName: 'Folder Person' })

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			'No mutation run.',
		])
	})

	it('a survivor killed by a run of another branch is not listed; one recorded by a run of the branch is', () => {
		const { root, recap } = recapScenario({ declared: true })
		const second = survivorOf({
			key: 'k2',
			line: SECOND_SURVIVOR_LINE,
			mutation: SECOND_SURVIVOR_MUTATION,
		})
		const first = reportRun({
			root,
			survivors: [survivorOf({ key: 'k1' }), second],
			now: startedAt(1),
		})
		reportRun({
			root,
			branch: 'feat/other',
			survivors: [second],
			detected: ['k1'],
			tested: ['k1', 'k2'],
			now: startedAt(2),
		})
		const recording = reportRun({
			root,
			survivors: [second],
			records: {
				[SCOPE_FILE]: {
					k2: {
						line: SECOND_SURVIVOR_LINE,
						mutation: SECOND_SURVIVOR_MUTATION,
						family: 'wording',
						reason: RECORDED_REASON,
						lineHash: 'h',
					},
				},
			},
			now: startedAt(3),
		})

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			`- changed run \`${first.runId}\`: 3 killed · 2 survived · 0 timed out · 0 no coverage`,
			`- changed run \`${recording.runId}\`: 3 killed · 1 survived · 0 timed out · 0 no coverage`,
			`- ${SECOND_ITEM}: recorded by \`${recording.runId}\``,
		])
	})

	it('a survivor first seen on the branch and closed by record → listed, recorded by `record`', () => {
		const { root, recap } = recapScenario({ declared: true })
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })], now: startedAt(1) })
		expect(recordWith({ root, keys: ['k1'] })).toMatchObject({ ok: true })

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			expect.stringContaining('changed run'),
			`- ${FIRST_ITEM}: recorded by \`${RECORD_MOVER}\``,
		])
	})

	it('a survivor first seen on a branch a merge lot merges and closed by record → listed', () => {
		const { root, lotsPath, out } = mergeHandover({})
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		reportRun({ root, branch: MERGED_BRANCH, survivors: [survivorOf({ key: 'k1' })] })
		expect(recordWith({ root, keys: ['k1'] })).toMatchObject({ ok: true })

		const result = runRecap({ cwd: dirname(out), argv: [out] })

		expect(result.exitCode).toBe(0)
		expect(recapSection({ output: result.output, heading: MUTATION_HEADING })).toEqual([
			expect.stringContaining('changed run'),
			`- ${FIRST_ITEM}: recorded by \`${RECORD_MOVER}\``,
		])
	})

	it('a survivor first seen on another branch and closed by record → not listed', () => {
		const { root, recap } = recapScenario({ declared: true })
		reportRun({ root, branch: 'feat/other', survivors: [survivorOf({ key: 'k1' })] })
		expect(recordWith({ root, keys: ['k1'] })).toMatchObject({ ok: true })

		expect(recapSection({ output: recap(), heading: MUTATION_HEADING })).toEqual([
			'No mutation run.',
		])
	})
})
