/**
 * `lot status --json` of a simulated lot carries the findings its start recorded (R1-5, 33S section 5): `checks.wouldRefuse`
 * equals `identity.wouldRefuse`, the `Refusal` objects; a lot that holds none shows `[]`.
 */
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { createStartWorkspace, recordOf, withJson } from '../../test/lot-start-workspace.ts'
import { BRIEF_BRANCH, LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Refusal } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot status: checks.wouldRefuse', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a simulated lot started over an open lot on its scope and an existing branch -> the findings of identity.json, as Refusal objects', () => {
		const start = createStartWorkspace()
		writeStoreLot({
			workspace: start.workspace,
			name: '0003-repo-taken',
			scope: ['src/dataflow/'],
			branch: BRIEF_BRANCH,
		})
		git({ root: start.repository, args: ['branch', BRIEF_BRANCH] })
		runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath, '--simulate', 'ready', '--json'],
			now: START_NOW,
		})
		const recorded = (
			recordOf({ folder: join(start.store, LOT_NAME), name: 'identity.json' }) as {
				wouldRefuse: Refusal[]
			}
		).wouldRefuse

		expect(recorded.map((finding) => finding.rule).sort()).toEqual(['branch-exists', 'overlap'])
		expect(
			withJson(runLot({ cwd: start.repository, argv: ['status', LOT_NAME, '--json'] })).json,
		).toMatchObject({ checks: { worktree: null, link: null, wouldRefuse: recorded } })
	})
})
