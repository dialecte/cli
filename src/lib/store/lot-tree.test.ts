/**
 * `lotTreeOf` (SAFE 3.6): the work tree a lot verb reads. A store lot reads its own worktree from anywhere, refused
 * naming the lot when it has none or it is gone; a folder with no identity reads the cwd's work tree, none outside one.
 */
import { mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../../test/brief-workspace.ts'
import { landingLotOf, removeLotWorktree } from '../../../test/landing-lot.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotTreeOf } from './lot-tree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lotTreeOf', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("a store lot from the main checkout -> the lot's own worktree", () => {
		const lot = landingLotOf()

		expect(lotTreeOf({ folder: lot.lotFolder, cwd: lot.repository.root })).toEqual({
			root: lot.worktree,
		})
	})

	it("a store lot from a folder outside any repository -> the lot's own worktree", () => {
		const lot = landingLotOf()

		expect(
			lotTreeOf({ folder: lot.lotFolder, cwd: temporaryFolder('dialecte-lot-tree-outside-') }),
		).toEqual({ root: lot.worktree })
	})

	it('a simulated lot (no worktree) -> refused, naming the lot', () => {
		const lot = landingLotOf()
		const folder = writeStoreLot({
			workspace: lot.workspace,
			name: '0002-repo-simulated',
			scope: ['src/'],
			simulated: true,
		})

		expect(lotTreeOf({ folder, cwd: lot.repository.root })).toEqual({
			refusal: expect.stringContaining('0002-repo-simulated'),
		})
	})

	it('a store lot whose worktree is gone -> refused, naming the lot', () => {
		const lot = landingLotOf()
		removeLotWorktree(lot)

		expect(lotTreeOf({ folder: lot.lotFolder, cwd: lot.repository.root })).toEqual({
			refusal: expect.stringContaining(lot.name),
		})
	})

	it("a folder with no identity -> the cwd's work tree", () => {
		const lot = landingLotOf()
		const folder = join(temporaryFolder('dialecte-lot-tree-plain-'), 'handover')
		mkdirSync(folder)

		expect(lotTreeOf({ folder, cwd: join(lot.worktree, 'src') })).toEqual({ root: lot.worktree })
	})

	it('a folder with no identity, run outside any work tree -> none', () => {
		const folder = realpathSync(temporaryFolder('dialecte-lot-tree-plain-'))

		expect(
			lotTreeOf({ folder, cwd: temporaryFolder('dialecte-lot-tree-outside-') }),
		).toBeUndefined()
	})
})
