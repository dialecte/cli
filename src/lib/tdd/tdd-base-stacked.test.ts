/**
 * The lot base of a stacked lot (FIX-ci-loop design, section 4): a lot started on an open lot (`lot start --on`)
 * measures from the parent's line, its fork point there, not from the base branch's merge-base, in the tdd step the
 * gate and the hook run.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../../test/brief-workspace.ts'
import { landingHostOf, pullRequestOf } from '../../../test/landing-repository.ts'
import { createStartWorkspace, entriesOf } from '../../../test/lot-start-workspace.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../../test/worktree-pool.ts'
import { runLotClose } from '../../commands/lot-close.ts'
import { runLot } from '../../commands/lot.ts'
import {
	findHandoverStore,
	recordHandoverState,
	registerHandover,
} from '../handover/handover-store.ts'
import { writeLanded } from '../landing/landed-record.ts'
import { readIdentity } from '../store/identity.ts'
import { checkTddReceipts } from './check-tdd-receipts.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T21:00:00.000Z')
const PARENT = '0005-repo-parent'
const PARENT_BRANCH = 'feat/parent'

/** The parent's landing record: pull request #5 pushed at `head`. */
function parentLandingText(params: { head: string }): string {
	return JSON.stringify({
		schema: 1,
		number: 5,
		url: 'https://host.test/pull/5',
		branch: PARENT_BRANCH,
		head: params.head,
		at: NOW.toISOString(),
	})
}

/** A commit of `file` on the checked out branch of `root`; its id. */
function commitFile(params: { root: string; file: string }): string {
	const { root, file } = params
	writeFiles({ root, files: { [file]: `export const value = '${file}'\n` } })
	git({ root, args: ['add', file] })
	git({ root, args: ['commit', '-qm', `feat: ${file}`] })
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/**
 * The open parent lot on its own branch (one commit ahead of main), a child started on it, then main moves on: the
 * child's worktree and the parent's tip.
 */
function stackedChild(): {
	worktree: string
	parentTip: string
	parentFolder: string
	repository: string
} {
	const start: StartWorkspace = createStartWorkspace()
	const { repository } = start
	git({ root: repository, args: ['checkout', '-q', '-b', PARENT_BRANCH] })
	const parentTip = commitFile({ root: repository, file: 'src/parent.ts' })
	git({ root: repository, args: ['checkout', '-q', 'main'] })
	writeStoreLot({
		workspace: start.workspace,
		name: PARENT,
		scope: ['src/parent.ts'],
		branch: PARENT_BRANCH,
		repository,
	})
	runLot({
		cwd: start.cwd,
		argv: ['start', start.workspace.briefPath, '--on', PARENT, '--json'],
		now: NOW,
	})
	commitFile({ root: repository, file: 'src/main-moves.ts' })
	const [child] = entriesOf(start.store).filter((name) => name !== PARENT)
	const worktree = readIdentity({ lotFolder: join(start.store, child ?? 'none') })?.worktree
	return {
		worktree: worktree ?? 'no-child-worktree',
		parentTip,
		parentFolder: join(start.store, PARENT),
		repository,
	}
}

describe('the lot base of a stacked lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a child of an open parent lot, main moved on → the tdd step measures from the parent’s tip, named as the parent’s line', async () => {
		const { worktree, parentTip } = stackedChild()
		const short = git({ root: worktree, args: ['rev-parse', '--short', parentTip] }).trim()

		await expect(
			checkTddReceipts({ root: worktree, packageJson: {}, measureLot: true }),
		).resolves.toMatchObject({ baseNote: `tdd base: ${short} (lot base ${PARENT_BRANCH})` })
	})

	it('a child of a parent lot recorded landed (its landed.json), git unable to prove it → the tdd step measures from main, at the parent’s landed tip', async () => {
		const { worktree, parentTip, parentFolder } = stackedChild()
		writeLanded({
			lotFolder: parentFolder,
			fact: { schema: 1, how: 'host', tip: parentTip, base: 'main', at: NOW.toISOString() },
		})
		const short = git({ root: worktree, args: ['rev-parse', '--short', parentTip] }).trim()

		await expect(
			checkTddReceipts({ root: worktree, packageJson: {}, measureLot: true }),
		).resolves.toMatchObject({ baseNote: `tdd base: ${short} (lot base main)` })
	})

	it('a child of a parent lot the registry records committed, no landed.json, not on main → the tdd step still measures from the parent’s line', async () => {
		const { worktree, parentTip, parentFolder, repository } = stackedChild()
		registerHandover({ root: repository, folder: parentFolder, branch: PARENT_BRANCH, now: NOW })
		recordHandoverState({
			store: findHandoverStore(repository),
			folder: parentFolder,
			state: 'committed',
		})
		const short = git({ root: worktree, args: ['rev-parse', '--short', parentTip] }).trim()

		await expect(
			checkTddReceipts({ root: worktree, packageJson: {}, measureLot: true }),
		).resolves.toMatchObject({ baseNote: `tdd base: ${short} (lot base ${PARENT_BRANCH})` })
	})

	it('a child of a parent lot whose pull request the host says merged, recorded by lot close of the parent → the tdd step measures from main, at the parent’s tip', async () => {
		const { worktree, parentTip, parentFolder, repository } = stackedChild()
		writeFiles({
			root: parentFolder,
			files: { 'landing.json': parentLandingText({ head: parentTip }) },
		})
		const host = landingHostOf({
			byNumber: { 5: pullRequestOf({ number: 5, state: 'merged', head: parentTip }) },
		}).host
		runLotClose({
			cwd: repository,
			argv: [PARENT, '--json'],
			now: NOW,
			host,
			spawner: createRecordingSpawner().spawner,
			listProcesses: () => [],
			scratchRoots: [],
		})
		const short = git({ root: worktree, args: ['rev-parse', '--short', parentTip] }).trim()

		await expect(
			checkTddReceipts({ root: worktree, packageJson: {}, measureLot: true }),
		).resolves.toMatchObject({ baseNote: `tdd base: ${short} (lot base main)` })
	})

	it('a child whose stack parent’s records do not read → the tdd step fails naming the parent, never measured as a lot not stacked', async () => {
		const { worktree, parentFolder } = stackedChild()
		rmSync(join(parentFolder, 'identity.json'), { force: true })

		await expect(
			checkTddReceipts({ root: worktree, packageJson: {}, measureLot: true }),
		).resolves.toMatchObject({
			status: 'failed',
			reason: expect.stringContaining(`the stack parent ${PARENT} cannot be read`),
		})
	})
})
