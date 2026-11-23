/**
 * The lot base of a stacked lot (FIX-ci-loop design, section 4): a lot started on an open lot (`lot start --on`)
 * measures from the parent's line, its fork point there, not from the base branch's merge-base, in the tdd step the
 * gate and the hook run.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../../test/brief-workspace.ts'
import { landingHostOf, changeRequestOf } from '../../../test/landing-repository.ts'
import { createStartWorkspace, entriesOf } from '../../../test/lot-start-workspace.ts'
import {
	cloneRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
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
import { STACK_RECORD_DAMAGED } from '../landing/lot-landing.constants.ts'
import { readIdentity } from '../store/identity.ts'
import { checkTddReceipts } from './check-tdd-receipts.ts'
import { isStackedLotWorktree, resolveTddBase } from './tdd-base.ts'

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

/**
 * The repository's main pushed to a new bare origin, then `files` committed on origin's main from another clone (main
 * moving on there only), origin fetched: origin's main is ahead of the local one.
 */
function moveOriginMain(params: { repository: string; files: Record<string, string> }): void {
	const { repository } = params
	const folder = temporaryFolder('dialecte-stacked-origin-')
	const origin = join(folder, 'origin.git')
	git({ root: folder, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root: repository, args: ['remote', 'add', 'origin', origin] })
	git({ root: repository, args: ['push', '-q', 'origin', 'main'] })
	const other = cloneRepository({ origin, into: join(folder, 'other') })
	writeFiles({ root: other, files: params.files })
	git({ root: other, args: ['add', '-A'] })
	git({ root: other, args: ['commit', '-qm', 'chore(release): main moves on'] })
	git({ root: other, args: ['push', '-q', 'origin', 'main'] })
	git({ root: repository, args: ['fetch', '-q', 'origin'] })
}

describe('the lot base of a stacked lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a child of an open parent lot, main moved on → the tdd step measures from the parent’s tip, named as the parent’s line', async () => {
		const { worktree, parentTip } = stackedChild()
		const short = git({ root: worktree, args: ['rev-parse', '--short', parentTip] }).trim()

		await expect(
			checkTddReceipts({ root: worktree, packageJson: {}, measureLot: true }),
		).resolves.toMatchObject({ baseNote: `tdd base: ${short} (lot base ${PARENT_BRANCH})` })
	})

	it("a child of an open parent lot that merged origin's main after a release there → the lot base joins the parent's line and origin's main: named so, no file only main changed", () => {
		const { worktree, repository } = stackedChild()
		moveOriginMain({
			repository,
			files: { 'src/release.test.ts': "it('released', () => {})\n" },
		})
		git({ root: worktree, args: ['fetch', '-q', 'origin'] })
		git({ root: worktree, args: ['merge', '--no-edit', '-q', 'origin/main'] })

		const base = resolveTddBase({ root: worktree, packageJson: {} })
		const changed =
			'failure' in base
				? []
				: git({ root: worktree, args: ['diff', '--name-only', base.commit, 'HEAD'] }).split('\n')

		expect({
			base: 'failure' in base ? base : { kind: base.kind, source: base.source },
			mainFile: changed.includes('src/release.test.ts'),
		}).toEqual({
			base: { kind: 'lot', source: `lot base ${PARENT_BRANCH} joined with origin/main` },
			mainFile: false,
		})
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
			byNumber: { 5: changeRequestOf({ number: 5, state: 'merged', head: parentTip }) },
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

	it('a child whose stack.json is damaged → the tdd step fails naming the record, never measured as a lot not stacked', async () => {
		const { worktree, parentFolder } = stackedChild()
		writeFileSync(join(parentFolder, '..', childOf(worktree), 'stack.json'), '{ torn')

		await expect(
			checkTddReceipts({ root: worktree, packageJson: {}, measureLot: true }),
		).resolves.toMatchObject({
			status: 'failed',
			reason: expect.stringContaining(
				STACK_RECORD_DAMAGED.replace('{reason}', 'stack.json does not read as a stack record'),
			),
		})
	})

	it('a child whose stack.json is damaged → its worktree reads as stacked, so the gate measures it as a lot', () => {
		const { worktree, parentFolder } = stackedChild()
		writeFileSync(join(parentFolder, '..', childOf(worktree), 'stack.json'), '{ torn')

		expect(isStackedLotWorktree({ root: worktree })).toBe(true)
	})
})

/** The child's lot folder name: its worktree's folder name. */
function childOf(worktree: string): string {
	return worktree.split('/').at(-1) ?? 'no-child'
}
