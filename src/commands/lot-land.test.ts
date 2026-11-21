/** `dialecte lot land <id>`: the store lot resolved, its worktree's branch landed through the host into the base. */
import { chmodSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { recordingHost } from '../../test/land-lot.ts'
import { cliTemplate } from '../../test/lot-pr.ts'
import { cloneRepository, git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { registeredEntryOf } from '../lib/handover/handover-store-read.ts'
import { handoverStoreOf } from '../lib/handover/handover-store.ts'
import { TEMPLATE_PATH } from '../lib/pr/change-request.constants.ts'
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
	writeFiles({ root: workspace.repository, files: { [TEMPLATE_PATH]: cliTemplate() } })
	git({ root: workspace.repository, args: ['add', '-A'] })
	git({ root: workspace.repository, args: ['commit', '-qm', 'chore: the template'] })
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
		expect(calls).toEqual(['read feat/x', 'open feat/x -> main "feat: x" draft'])
		expect(JSON.parse(readFileSync(join(lotFolder, 'landing.json'), 'utf8'))).toMatchObject({
			number: 7,
		})
		expect(result.output).toContain('dialecte lot approve 0001-repo-x --by <who> queues it')
	})

	it('--draft → refused, exit 2, nothing asked of the host or pushed: lot land always drafts now, lot approve queues', () => {
		const { workspace } = landableLot()
		const { host, calls } = recordingHost()

		const result = runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x', '--draft'], host })

		expect({ result, calls }).toEqual({
			result: {
				exitCode: 2,
				output: 'lot land: --draft is gone: lot land always drafts now; queue with lot approve',
			},
			calls: [],
		})
	})

	it('a base named by its commit, which main holds → not a stack: landed into main', () => {
		const { workspace } = landableLot({ baseRef: (main) => main.slice(0, 7) })
		const { host, calls } = recordingHost()

		const result = runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host })

		expect(result.exitCode).toBe(0)
		expect(calls).toContain('open feat/x -> main "feat: x" draft')
	})

	it('cut from a commit main does not hold, named by its sha → a stack: refused naming the commit, nothing asked of the host', () => {
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
			base: { ref: cut.slice(0, 7), commit: cut },
		})
		const { host, calls } = recordingHost()

		const result = runLotLand({ cwd: workspace.repository, argv: ['0002-repo-y'], host })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(
			`was cut from ${cut.slice(0, 7)} (${cut.slice(0, 12)}), which main does not hold`,
		)
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

/** The lot's pushed head squash-merged into origin's main from another clone, as the merge queue lands it. */
function squashOnOrigin(params: { workspace: { workspace: string }; head: string }): void {
	const other = join(temporaryFolder('dialecte-land-queue-'), 'queue')
	cloneRepository({ origin: join(params.workspace.workspace, 'origin.git'), into: other })
	git({ root: other, args: ['fetch', '-q', 'origin', params.head] })
	git({ root: other, args: ['merge', '-q', '--squash', 'FETCH_HEAD'] })
	git({ root: other, args: ['commit', '-qm', 'feat(x): x (squashed)'] })
	git({ root: other, args: ['push', '-q', 'origin', 'main'] })
}

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
				title: 'feat: x',
				body: '',
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

describe(
	'dialecte lot close after a push outside lot land',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/**
		 * The lot landed as a draft, then a fix committed and pushed by hand (the recorded head is the draft's), then closed
		 * with its pull request merged at `mergedAt` (given the worktree's HEAD).
		 */
		function closeAfterHandPush(params: { mergedAt: (head: string) => string }) {
			const { workspace, lotFolder } = landableLot()
			const worktree = join(workspace.workspace, '.worktrees', '0001-repo-x')
			runLotLand({
				cwd: workspace.repository,
				argv: ['0001-repo-x'],
				host: recordingHost().host,
			})
			writeFiles({ root: worktree, files: { 'src/x.ts': 'export const x = 2\n' } })
			git({ root: worktree, args: ['commit', '-qam', 'fix(x): x answers two'] })
			git({ root: worktree, args: ['push', '-q', 'origin', 'feat/x'] })
			const head = git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
			const merged = recordingHost({
				existing: {
					number: 7,
					url: 'https://host.test/pull/7',
					title: 'feat: x',
					body: '',
					state: 'merged',
					draft: false,
					queued: false,
					head: params.mergedAt(head),
				},
			})
			const store = handoverStoreOf(workspace.repository)
			const name = registeredEntryOf({ store, folder: lotFolder })?.name ?? ''
			const closed = runLotClose({
				cwd: workspace.repository,
				argv: [name],
				host: merged.host,
				spawner: createRecordingSpawner().spawner,
			})
			return {
				closed,
				head,
				landed: JSON.parse(readFileSync(join(lotFolder, 'landed.json'), 'utf8')) as unknown,
				state: registeredEntryOf({ store, folder: lotFolder })?.state,
			}
		}

		it("merged at the worktree's HEAD, landing.json naming the draft's head → committed, its landed fact at the merged head", () => {
			const { closed, head, landed, state } = closeAfterHandPush({
				mergedAt: (worktreeHead) => worktreeHead,
			})

			expect({
				line: closed.output.includes(
					`landed on main at ${head.slice(0, 12)}: pull request #7 merged`,
				),
				state,
				landed,
			}).toMatchObject({ line: true, state: 'committed', landed: { how: 'host', tip: head } })
		})
	},
)

describe(
	'dialecte lot close of a lot rebuilt before its landing',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/**
		 * The lot's commit dropped, a work-in-progress commit writing `wip` made then dropped (a reset to rebuild the lot),
		 * the lot committed again, landed, and closed with its pull request merged at the landed head.
		 */
		function closeRebuiltLot(params: {
			wip: Record<string, string>
			afterLanding?: (worktree: string) => void
		}) {
			const { workspace, lotFolder } = landableLot()
			const worktree = join(workspace.workspace, '.worktrees', '0001-repo-x')
			git({ root: worktree, args: ['reset', '-q', '--hard', 'HEAD~1'] })
			writeFiles({ root: worktree, files: params.wip })
			git({ root: worktree, args: ['add', '-A'] })
			git({ root: worktree, args: ['commit', '-qm', 'wip: before the rebuild'] })
			git({ root: worktree, args: ['reset', '-q', '--hard', 'HEAD~1'] })
			writeFiles({ root: worktree, files: { 'src/x.ts': 'export const x = 1\n' } })
			git({ root: worktree, args: ['add', 'src/x.ts'] })
			git({ root: worktree, args: ['commit', '-qm', 'feat(x): x answers one, rebuilt'] })
			runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host: recordingHost().host })
			params.afterLanding?.(worktree)
			const landing = JSON.parse(readFileSync(join(lotFolder, 'landing.json'), 'utf8')) as {
				head: string
			}
			squashOnOrigin({ workspace, head: landing.head })
			const merged = recordingHost({
				existing: {
					number: 7,
					url: 'https://host.test/pull/7',
					title: 'feat: x',
					body: '',
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
				listProcesses: function none() {
					return []
				},
			})
			return { closed, worktree }
		}

		it('a work-in-progress commit on lot paths made after the landing and dropped, then one more commit → still kept, named', () => {
			const { closed, worktree } = closeRebuiltLot({
				wip: { 'src/x.ts': 'export const x = 0\n' },
				afterLanding: function dropThenCommit(root) {
					writeFiles({ root, files: { 'src/x.ts': 'export const x = 3\n' } })
					git({ root, args: ['commit', '-qam', 'wip: after the landing'] })
					git({ root, args: ['reset', '-q', '--hard', 'HEAD~1'] })
					writeFiles({ root, files: { 'src/y.ts': 'export const y = 1\n' } })
					git({ root, args: ['add', 'src/y.ts'] })
					git({ root, args: ['commit', '-qm', 'feat(y): y answers one'] })
				},
			})

			expect({
				named: closed.output.includes('1 commit(s) made since its landing'),
				worktree: existsSync(worktree),
			}).toEqual({ named: true, worktree: true })
		})

		it('a dropped work-in-progress commit touching a file outside the lot paths → closed: its branch reflog holds it, named with the reflog clock', () => {
			const { closed, worktree } = closeRebuiltLot({ wip: { 'README.md': 'wip\n' } })

			expect({
				named: closed.output.includes(
					"dropped from the branch, kept in its reflog until git's reflog expiry",
				),
				worktree: existsSync(worktree),
			}).toEqual({ named: true, worktree: false })
		})
	},
)

describe('dialecte lot close named by its lot id', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the lot folder name of a landed lot whose hand-over entry has another name → that entry confirmed and closed', () => {
		const { workspace, lotFolder } = landableLot()
		runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host: recordingHost().host })
		const landing = JSON.parse(readFileSync(join(lotFolder, 'landing.json'), 'utf8')) as {
			head: string
		}
		const merged = recordingHost({
			existing: {
				number: 7,
				url: 'https://host.test/pull/7',
				title: 'feat: x',
				body: '',
				state: 'merged',
				draft: false,
				queued: false,
				head: landing.head,
			},
		})

		const closed = runLotClose({
			cwd: workspace.repository,
			argv: ['0001-repo-x'],
			host: merged.host,
			spawner: createRecordingSpawner().spawner,
			listProcesses: function none() {
				return []
			},
		})

		expect({
			confirmed: closed.output.includes('pull request #7 merged'),
			exitCode: closed.exitCode,
			state: registeredEntryOf({ store: handoverStoreOf(workspace.repository), folder: lotFolder })
				?.state,
		}).toEqual({ confirmed: true, exitCode: 0, state: 'committed' })
	})
})

describe('dialecte lot close of a lot its landing rebased', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** The lot landed after origin's main moved (rebased), then closed with its pull request merged at the pushed head. */
	function landRebasedThenClose(
		params: { afterLanding?: (landed: { worktree: string; lotFolder: string }) => void } = {},
	) {
		const { workspace, lotFolder } = landableLot()
		const worktree = join(workspace.workspace, '.worktrees', '0001-repo-x')
		const other = join(workspace.workspace, 'other')
		// the scratch identity: a CI machine has no git identity of its own
		cloneRepository({ origin: join(workspace.workspace, 'origin.git'), into: other })
		writeFiles({ root: other, files: { 'src/other.ts': 'export {}\n' } })
		git({ root: other, args: ['add', 'src/other.ts'] })
		git({ root: other, args: ['commit', '-qm', 'feat: landed by the queue'] })
		git({ root: other, args: ['push', '-q', 'origin', 'main'] })
		runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host: recordingHost().host })
		params.afterLanding?.({ worktree, lotFolder })
		const landing = JSON.parse(readFileSync(join(lotFolder, 'landing.json'), 'utf8')) as {
			head: string
		}
		squashOnOrigin({ workspace, head: landing.head })
		const merged = recordingHost({
			existing: {
				number: 7,
				url: 'https://host.test/pull/7',
				title: 'feat: x',
				body: '',
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
			argv: [name, '--json'],
			host: merged.host,
			spawner: createRecordingSpawner().spawner,
			listProcesses: function none() {
				return []
			},
		})
		return { closed, worktree }
	}

	it('its pre-rebase commits only in the HEAD reflog, their work squash-merged → the worktree closes', () => {
		const { closed, worktree } = landRebasedThenClose()

		expect(closed.output).not.toContain('its removal would lose')
		expect(existsSync(worktree)).toBe(false)
	})

	it('a reflog commit with work of its own made after the landing, then dropped → closed: its branch reflog holds it, named with the reflog clock', () => {
		const { closed, worktree } = landRebasedThenClose({
			afterLanding: function dropOne(landed) {
				writeFiles({ root: landed.worktree, files: { 'src/dropped.ts': 'export {}\n' } })
				git({ root: landed.worktree, args: ['add', 'src/dropped.ts'] })
				git({ root: landed.worktree, args: ['commit', '-qm', 'wip: dropped'] })
				git({ root: landed.worktree, args: ['reset', '-q', '--hard', 'HEAD~1'] })
			},
		})

		expect(closed.output).toContain(
			"dropped from the branch, kept in its reflog until git's reflog expiry",
		)
		expect(existsSync(worktree)).toBe(false)
	})

	/** After the landing: a commit beside the lot's own (same parent) adding `src/x.ts` as `text`, then dropped. */
	function dropSibling(text: string) {
		return function dropOne(landed: { worktree: string; lotFolder: string }) {
			const root = landed.worktree
			const tip = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
			git({ root, args: ['reset', '-q', '--hard', 'HEAD~1'] })
			writeFiles({ root, files: { 'src/x.ts': text } })
			git({ root, args: ['add', 'src/x.ts'] })
			git({ root, args: ['commit', '-qm', 'wip: a sibling'] })
			git({ root, args: ['reset', '-q', '--hard', tip] })
		}
	}

	it('a dropped commit the same as the lot one but for its indentation -> closed, never counted landed: named as held by the branch reflog only', () => {
		const { closed, worktree } = landRebasedThenClose({
			afterLanding: dropSibling('  export const x = 1\n'),
		})

		expect(closed.output).toContain(
			"dropped from the branch, kept in its reflog until git's reflog expiry",
		)
		expect(existsSync(worktree)).toBe(false)
	})

	it('a dropped commit with another patch -> closed, named as held by the branch reflog only', () => {
		const { closed, worktree } = landRebasedThenClose({
			afterLanding: dropSibling('export const x = 2\n'),
		})

		expect(closed.output).toContain(
			"dropped from the branch, kept in its reflog until git's reflog expiry",
		)
		expect(existsSync(worktree)).toBe(false)
	})
})

describe(
	'dialecte lot close of a landed lot holding its own declaration',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/**
		 * The lot landed (no rebase) with `.dialecte/lot.json` and `extra` ignored files in its worktree, then closed
		 * merged. `link`: where its `.dialecte/lot` points (`own`, the default: this lot's folder; `other`: another lot's
		 * folder); `archived`: a `lot.json` already archived in the lot folder; `readOnly`: the lot folder read-only during
		 * the close (the archive copy cannot be written).
		 */
		function landWithDeclarationThenClose(
			params: {
				extra?: Record<string, string>
				link?: 'own' | 'other'
				archived?: string
				readOnly?: boolean
			} = {},
		) {
			const { workspace, lotFolder } = landableLot()
			const worktree = join(workspace.workspace, '.worktrees', '0001-repo-x')
			writeFiles({
				root: workspace.repository,
				files: { '.git/info/exclude': '.dialecte/\n*.tmp\n' },
			})
			writeFiles({
				root: worktree,
				files: {
					'.dialecte/lot.json': '{"accept":[{"case":"a","reason":"b"}]}\n',
					...params.extra,
				},
			})
			symlinkSync(
				params.link === 'other' ? temporaryFolder('dialecte-other-lot-') : lotFolder,
				join(worktree, '.dialecte', 'lot'),
			)
			runLotLand({ cwd: workspace.repository, argv: ['0001-repo-x'], host: recordingHost().host })
			if (params.archived !== undefined) writeFileSync(join(lotFolder, 'lot.json'), params.archived)
			const landing = JSON.parse(readFileSync(join(lotFolder, 'landing.json'), 'utf8')) as {
				head: string
			}
			const merged = recordingHost({
				existing: {
					number: 7,
					url: 'https://host.test/pull/7',
					title: 'feat: x',
					body: '',
					state: 'merged',
					draft: false,
					queued: false,
					head: landing.head,
				},
			})
			const name =
				registeredEntryOf({ store: handoverStoreOf(workspace.repository), folder: lotFolder })
					?.name ?? ''
			if (params.readOnly) chmodSync(lotFolder, 0o555)
			try {
				const closed = runLotClose({
					cwd: workspace.repository,
					argv: [name, '--json'],
					host: merged.host,
					spawner: createRecordingSpawner().spawner,
					listProcesses: function none() {
						return []
					},
				})
				return { closed, worktree, lotFolder }
			} finally {
				// writable again: the suite removes what the case made
				chmodSync(lotFolder, 0o755)
			}
		}

		it('its only ignored file its own .dialecte/lot.json -> the worktree closes, the declaration archived in the lot folder', () => {
			const { closed, worktree, lotFolder } = landWithDeclarationThenClose()

			expect(closed.output).not.toContain('ignored files')
			expect(existsSync(worktree)).toBe(false)
			expect(readFileSync(join(lotFolder, 'lot.json'), 'utf8')).toBe(
				'{"accept":[{"case":"a","reason":"b"}]}\n',
			)
		})

		it('its .dialecte/lot pointing at another lot (new work started there) -> kept, the declaration named', () => {
			const { closed, worktree } = landWithDeclarationThenClose({ link: 'other' })

			expect(closed.output).toContain('.dialecte/lot.json')
			expect(existsSync(worktree)).toBe(true)
		})

		it('a lot.json already archived in the lot folder that differs from the worktree one -> archived beside it as lot.landed.json, that archive never overwritten, closed', () => {
			const { closed, worktree, lotFolder } = landWithDeclarationThenClose({
				archived: '{"accept":[]}\n',
			})

			expect({
				closed: closed.output.includes('"closed": true'),
				worktreeLeft: existsSync(worktree),
				archived: readFileSync(join(lotFolder, 'lot.json'), 'utf8'),
				landed: readFileSync(join(lotFolder, 'lot.landed.json'), 'utf8'),
			}).toEqual({
				closed: true,
				worktreeLeft: false,
				archived: '{"accept":[]}\n',
				landed: '{"accept":[{"case":"a","reason":"b"}]}\n',
			})
		})

		it('the archive copy cannot be written (a read-only lot folder) -> kept, nothing moved', () => {
			const { closed, worktree, lotFolder } = landWithDeclarationThenClose({ readOnly: true })

			expect(closed.output).toContain('"kept"')
			expect(existsSync(worktree)).toBe(true)
			expect(existsSync(join(lotFolder, 'lot.json'))).toBe(false)
		})

		it('another ignored file beside it -> still kept, that file named', () => {
			const { closed, worktree } = landWithDeclarationThenClose({
				extra: { 'notes.tmp': 'mine\n' },
			})

			expect(closed.output).toContain('notes.tmp')
			expect(closed.output).not.toContain('.dialecte/lot.json')
			expect(existsSync(worktree)).toBe(true)
		})
	},
)

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
