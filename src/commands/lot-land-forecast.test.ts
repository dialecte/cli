import { FIXTURE_TEMPLATE_PATH } from '../../test/change-request-template.constants.ts'
/**
 * `lot land` with the forecast (33CO 4.2): the lot's committed HEAD against the base branch just fetched, refused
 * before any rebase or push on a conflict; its pairs with the other open lots printed for information only.
 */
import {
	SHARED_LINE10_B,
	SHARED_LINE2_A,
	SHARED_LINE2_B,
	SHARED_LINE2_MAIN,
} from '../../test/forecast-workspace.constants.ts'
import {
	commitOnMain,
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../test/forecast-workspace.ts'
import { recordingHost } from '../../test/land-lot.ts'
import { cliTemplate } from '../../test/lot-describe.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readForecastRecord } from '../lib/coordination/forecast-record.ts'
import { runLotLand } from './lot-land.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastWorkspace } from '../../test/forecast-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A forecast workspace whose origin's main holds the pull request template. */
function landingWorkspace(): ForecastWorkspace {
	const workspace = createForecastWorkspace()
	commitOnMain({ workspace, files: { [FIXTURE_TEMPLATE_PATH]: cliTemplate() } })
	return workspace
}

/** The branches origin holds. */
function originBranchesOf(workspace: ForecastWorkspace): string[] {
	return git({ root: workspace.origin, args: ['branch', '--format=%(refname:short)'] })
		.split('\n')
		.filter((name) => name !== '')
}

describe('lot land with the forecast', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot land with a conflict against the fetched base -> refused before any rebase or push, naming files and ranges', () => {
		const workspace = landingWorkspace()
		const lot = startForecastLot({ workspace, feature: 'lot-a' })
		workInLot({ lot, files: { 'src/shared.ts': SHARED_LINE2_A }, commit: true })
		commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE2_MAIN } })
		const head = git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] })
		const { host, calls } = recordingHost()

		const result = runLotLand({
			cwd: workspace.repository,
			argv: [lot.name],
			host,
		})

		expect({
			exitCode: result.exitCode,
			output: result.output,
			head: git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] }),
			pushed: originBranchesOf(workspace),
			opened: calls.filter((call) => call.startsWith('open')),
		}).toEqual({
			exitCode: 1,
			output: expect.stringContaining(
				'lot land: the lot conflicts with origin/main in src/shared.ts:2-6 (content)',
			),
			head,
			pushed: ['main'],
			opened: [],
		})
	})

	it('lot land clean against the base but conflicting with an open lot -> lands, the conflict printed for information, the land forecast recorded', () => {
		const workspace = landingWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A }, commit: true })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
		const { host } = recordingHost()

		const result = runLotLand({
			cwd: workspace.repository,
			argv: [first.name],
			host,
		})

		expect({
			exitCode: result.exitCode,
			pair: result.output.split('\n').filter((line) => line.startsWith(`! ${second.name}:`)),
			triggers: readForecastRecord({ lotFolder: first.lotFolder }).lines.map(
				(line) => line.trigger,
			),
		}).toEqual({
			exitCode: 0,
			pair: [`! ${second.name}: forecast conflict: src/shared.ts:2-6 (content)`],
			triggers: ['land', 'land'],
		})
	})

	it('lot land clean against the base and against every open lot -> no forecast line printed', () => {
		const workspace = landingWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A }, commit: true })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE10_B } })
		const { host } = recordingHost()

		const result = runLotLand({
			cwd: workspace.repository,
			argv: [first.name],
			host,
		})

		expect({
			exitCode: result.exitCode,
			pair: result.output.split('\n').filter((line) => line.startsWith('! ')),
			triggers: readForecastRecord({ lotFolder: first.lotFolder }).lines.map(
				(line) => line.trigger,
			),
		}).toEqual({ exitCode: 0, pair: [], triggers: ['land', 'land'] })
	})
})
