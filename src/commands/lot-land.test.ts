/** `dialecte lot land <id>`: the store lot resolved, its worktree's branch landed through the host into the base. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { recordingHost } from '../../test/land-lot.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { registeredEntryOf } from '../lib/handover/handover-store-read.ts'
import { handoverStoreOf } from '../lib/handover/handover-store.ts'
import { runLotClose } from './lot-close.ts'
import { runLotLand } from './lot-land.ts'
import { lotStop } from './lot-stop.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * A store lot `0001-repo-x` whose worktree holds one commit on `feat/x`, the repository pushed to a bare origin; its
 * identity names the base it was cut from as `baseRef` (`main` when left out) at main's commit.
 */
function landableLot(params: { baseRef?: (main: string) => string } = {}) {
	const workspace = createBriefWorkspace()
	const origin = join(workspace.workspace, 'origin.git')
	git({ root: workspace.workspace, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root: workspace.repository, args: ['remote', 'add', 'origin', origin] })
	git({ root: workspace.repository, args: ['push', '-q', '-u', 'origin', 'main'] })
	const worktree = join(workspace.workspace, '.worktrees', '0001-repo-x')
	git({
		root: workspace.repository,
		args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree, 'main'],
	})
	const main = git({ root: workspace.repository, args: ['rev-parse', 'main'] }).trim()
	writeFiles({ root: worktree, files: { 'src/x.ts': 'export const x = 1\n' } })
	git({ root: worktree, args: ['add', 'src/x.ts'] })
	git({ root: worktree, args: ['commit', '-qm', 'feat(x): x answers one'] })
	const lotFolder = writeStoreLot({
		workspace,
		name: '0001-repo-x',
		scope: ['src/'],
		branch: 'feat/x',
		repository: workspace.repository,
		worktree,
		base: { ref: params.baseRef?.(main) ?? 'main', commit: main },
	})
	return { workspace, lotFolder }
}

describe('dialecte lot land', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a store lot → its branch landed into main through the host, the landing recorded in its folder, exit 0', () => {
		const { workspace, lotFolder } = landableLot()
		const { host, calls } = recordingHost()

		const result = runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host })

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual([
			'read feat/x',
			'open feat/x -> main "feat(x): x answers one"',
			'queue 7',
		])
		expect(JSON.parse(readFileSync(join(lotFolder, 'landing.json'), 'utf8'))).toMatchObject({
			number: 7,
		})
		expect(result.output).toContain('queued: the merge queue lands it')
	})

	it('--draft → opened as a draft, not queued', () => {
		const { workspace } = landableLot()
		const { host, calls } = recordingHost()

		runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x', '--draft'], host })

		expect(calls.at(-1)).toContain('draft')
	})

	it('a base named by its commit, which main holds → not a stack: landed into main', () => {
		const { workspace } = landableLot({ baseRef: (main) => main.slice(0, 7) })
		const { host, calls } = recordingHost()

		const result = runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host })

		expect(result.exitCode).toBe(0)
		expect(calls).toContain('queue 7')
	})

	it('cut from a commit main does not hold → a stack: refused, nothing asked of the host', () => {
		const { workspace } = landableLot()
		const parent = join(workspace.workspace, '.worktrees', 'parent')
		git({
			root: workspace.repository,
			args: ['worktree', 'add', '-q', '-b', 'feat/parent', parent, 'main'],
		})
		writeFiles({ root: parent, files: { 'src/p.ts': 'export const p = 1\n' } })
		git({ root: parent, args: ['add', 'src/p.ts'] })
		git({ root: parent, args: ['commit', '-qm', 'feat(p): p answers one'] })
		const cut = git({ root: parent, args: ['rev-parse', 'HEAD'] }).trim()
		const child = join(workspace.workspace, '.worktrees', '0002-repo-y')
		git({ root: workspace.repository, args: ['worktree', 'add', '-q', '-b', 'feat/y', child, cut] })
		writeStoreLot({
			workspace,
			name: '0002-repo-y',
			scope: ['src/y/'],
			branch: 'feat/y',
			repository: workspace.repository,
			worktree: child,
			base: { ref: 'feat/parent', commit: cut },
		})
		const { host, calls } = recordingHost()

		const result = runLotLand({ cwd: workspace.repository, argv: ['0002-repo-y'], host })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('a stacked lot lands as a stack')
		expect(calls).toEqual([])
	})

	it.each([
		{ label: 'no id', argv: [] },
		{ label: 'two ids', argv: ['0001-repo-x', '0002-repo-y'] },
	])('$label → usage, exit 2, nothing landed', ({ argv }) => {
		const { workspace, lotFolder } = landableLot()
		const { host, calls } = recordingHost()

		expect(runLotLand({ cwd: workspace.repository, argv, host }).exitCode).toBe(2)
		expect(calls).toEqual([])
		expect(existsSync(join(lotFolder, 'landing.json'))).toBe(false)
	})
})

describe('dialecte lot close of a landed lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("its landing's pull request merged at the pushed head → the close says the lot is committed first", () => {
		const { workspace, lotFolder } = landableLot()
		runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host: recordingHost().host })
		const landing = JSON.parse(readFileSync(join(lotFolder, 'landing.json'), 'utf8')) as {
			head: string
		}
		const merged = recordingHost({
			existing: {
				number: 7,
				url: 'https://host.test/pull/7',
				state: 'merged',
				draft: false,
				queued: false,
				head: landing.head,
			},
		})
		const name =
			registeredEntryOf({ store: handoverStoreOf(workspace.repository), folder: lotFolder })
				?.name ?? ''

		const closed = runLotClose({
			cwd: workspace.repository,
			argv: [name],
			host: merged.host,
			spawner: createRecordingSpawner().spawner,
		})

		expect(closed.output).toContain('pull request #7 merged')
		expect(
			registeredEntryOf({ store: handoverStoreOf(workspace.repository), folder: lotFolder })?.state,
		).toBe('committed')
	})
})

describe('a landing lot, as the other lot verbs read it', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot status → next: lot land <lot>, also: lot close <entry>', () => {
		const { workspace } = landableLot()
		runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host: recordingHost().host })

		const status = runLot({ cwd: workspace.repository, argv: ['status', '0001-repo-x'] })

		expect(status.output).toContain('dialecte lot land 0001-repo-x')
		expect(status.output).toContain('dialecte lot close ')
	})

	it('lot stop → its pull request closed (out of the queue), its entry abandoned, the lot canceled', () => {
		const { workspace, lotFolder } = landableLot()
		runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host: recordingHost().host })
		const { host, calls } = recordingHost()

		const stopped = lotStop({
			cwd: workspace.repository,
			argv: ['0001-repo-x', '--reason', 'not needed'],
			host,
		})

		expect(stopped.exitCode).toBe(0)
		expect(calls).toEqual(['close 7'])
		expect(
			registeredEntryOf({ store: handoverStoreOf(workspace.repository), folder: lotFolder })?.state,
		).toBe('abandoned')
	})

	it('a stopped (canceled) lot → lot land refuses it, nothing asked of the host', () => {
		const { workspace } = landableLot()
		lotStop({
			cwd: workspace.repository,
			argv: ['0001-repo-x', '--reason', 'not needed'],
			host: recordingHost().host,
		})
		const { host, calls } = recordingHost()

		const landed = runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host })

		expect(landed.exitCode).toBe(1)
		expect(landed.output).toContain('is canceled: only a working or ready lot lands')
		expect(calls).toEqual([])
	})
})
