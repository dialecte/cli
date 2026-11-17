/** A lot lands through its pull request: checked, rebased onto origin's base when behind, pushed, opened, queued, recorded. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { landingRepository, landOnOrigin, recordingHost } from '../../../test/land-lot.ts'
import {
	cloneRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { registeredEntryOf } from './handover-store-read.ts'
import { handoverStoreOf } from './handover-store.ts'
import { confirmLanding, landLot } from './land-lot.ts'

import { describe, expect, it } from 'vitest'

import type { LandingRepository } from '../../../test/land-lot.types.ts'
import type { HostAdapter, PullRequest } from '../host/host.types.ts'

const NOW = new Date('2026-11-16T03:00:00Z')

/** `landLot` of the landing repository's lot `feat/x` into main. */
function land(params: { repository: LandingRepository; host: HostAdapter; draft?: boolean }) {
	return landLot({
		...params.repository,
		lot: '0001-repo-x',
		branch: 'feat/x',
		base: 'main',
		host: params.host,
		draft: params.draft ?? false,
		now: NOW,
	})
}

/** The lot's tip in its worktree. */
function tipOf(repository: LandingRepository): string {
	return git({ root: repository.worktree, args: ['rev-parse', 'HEAD'] }).trim()
}

/** A landing already recorded for the lot: pull request #7, pushed at `head`. */
function recordLanding(params: { repository: LandingRepository; head: string }): void {
	writeFileSync(
		join(params.repository.lotFolder, 'landing.json'),
		JSON.stringify({
			schema: 1,
			number: 7,
			url: 'https://host.test/pull/7',
			branch: 'feat/x',
			head: params.head,
			at: '',
		}),
	)
}

/** Pull request #7 of the lot in `state`, its head at `head`. */
function pullRequestOf(params: { state: PullRequest['state']; head: string }): PullRequest {
	return {
		number: 7,
		url: 'https://host.test/pull/7',
		title: 'feat(x): x answers one',
		state: params.state,
		draft: false,
		queued: false,
		head: params.head,
	}
}

describe('landLot', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a lot with no pull request → pushed, opened with its commit message as title, queued, the landing and a pending hand-over entry recorded', () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost()

		const landed = land({ repository, host })

		expect(landed.exitCode).toBe(0)
		expect(calls).toEqual([
			'read feat/x',
			'open feat/x -> main "feat(x): x answers one"',
			'queue 7',
		])
		const pushed = git({
			root: repository.root,
			args: ['ls-remote', repository.origin, 'refs/heads/feat/x'],
		})
		expect(pushed).toContain(tipOf(repository))
		expect(
			JSON.parse(readFileSync(join(repository.lotFolder, 'landing.json'), 'utf8')),
		).toMatchObject({
			number: 7,
			branch: 'feat/x',
			head: tipOf(repository),
		})
		expect(
			registeredEntryOf({
				store: handoverStoreOf(repository.worktree),
				folder: repository.lotFolder,
			})?.state,
		).toBe('pending')
	})

	it("origin's main moved since the cut → the lot rebased onto it first: the pushed tip holds the landed commit", () => {
		const repository = landingRepository()
		const landedTip = landOnOrigin({
			origin: repository.origin,
			files: { 'src/other.ts': 'export {}\n' },
		})
		const { host } = recordingHost()

		land({ repository, host })

		expect(
			git({
				root: repository.worktree,
				args: ['merge-base', '--is-ancestor', landedTip, tipOf(repository)],
			}),
		).toBe('')
	})

	it("a rebase onto origin's main that conflicts → refused naming the files, the rebase undone, nothing asked of the host", () => {
		const repository = landingRepository()
		landOnOrigin({ origin: repository.origin, files: { 'src/x.ts': 'export const x = 2\n' } })
		const { host, calls } = recordingHost()
		const before = tipOf(repository)

		const landed = land({ repository, host })

		expect(landed.exitCode).toBe(1)
		expect(landed.lines.join('\n')).toContain('src/x.ts')
		expect(tipOf(repository)).toBe(before)
		expect(calls).toEqual(['read feat/x'])
	})

	it.each([
		{
			label: 'a detached HEAD',
			arrange: (repository: LandingRepository) =>
				git({ root: repository.worktree, args: ['checkout', '-q', '--detach'] }),
			line: 'is not on feat/x (HEAD is detached)',
		},
		{
			label: 'an origin that cannot be fetched',
			arrange: (repository: LandingRepository) =>
				git({
					root: repository.worktree,
					args: [
						'remote',
						'set-url',
						'origin',
						join(temporaryFolder('dialecte-land-gone-'), 'gone.git'),
					],
				}),
			line: 'origin not fetched',
		},
	])('$label → refused before anything is pushed or asked', ({ arrange, line }) => {
		const repository = landingRepository()
		arrange(repository)
		const { host, calls } = recordingHost()

		const landed = land({ repository, host })

		expect(landed.exitCode).toBe(1)
		expect(landed.lines.join('\n')).toContain(line)
		expect(calls).toEqual([])
	})

	it('work in progress (a tracked file changed, an untracked one added) → the committed head pushed and opened, the work left in place and named', () => {
		const repository = landingRepository()
		const committed = tipOf(repository)
		writeFiles({
			root: repository.worktree,
			files: { 'src/x.ts': 'export const x = 3\n', 'src/x.test.ts': 'red\n' },
		})
		const { host, calls } = recordingHost()

		const landed = land({ repository, host, draft: true })

		expect(landed.exitCode).toBe(0)
		expect(calls).toEqual(['read feat/x', 'open feat/x -> main "feat(x): x answers one" draft'])
		expect(
			git({ root: repository.root, args: ['ls-remote', repository.origin, 'refs/heads/feat/x'] }),
		).toContain(committed)
		expect(landed.lines).toContain('uncommitted, not pushed: 2 files')
		expect(readFileSync(join(repository.worktree, 'src/x.ts'), 'utf8')).toBe('export const x = 3\n')
		expect(existsSync(join(repository.worktree, 'src/x.test.ts'))).toBe(true)
	})

	it("work in progress on a tracked file and origin's main moved → not rebased, the committed head pushed, the line says the rebase waits", () => {
		const repository = landingRepository()
		landOnOrigin({ origin: repository.origin, files: { 'src/other.ts': 'export {}\n' } })
		const committed = tipOf(repository)
		writeFiles({ root: repository.worktree, files: { 'src/x.ts': 'export const x = 3\n' } })
		const { host } = recordingHost()

		const landed = land({ repository, host, draft: true })

		expect(landed.exitCode).toBe(0)
		expect(tipOf(repository)).toBe(committed)
		expect(landed.lines.join('\n')).toContain(
			'not rebased onto origin/main: the worktree holds uncommitted changes',
		)
		expect(landed.lines).toContain('uncommitted, not pushed: 1 file')
		expect(readFileSync(join(repository.worktree, 'src/x.ts'), 'utf8')).toBe('export const x = 3\n')
	})

	it('a land that rebases → landing.json records the head it replaced; a second rebasing land keeps both', () => {
		const repository = landingRepository()
		landOnOrigin({ origin: repository.origin, files: { 'src/one.ts': 'export {}\n' } })
		const first = tipOf(repository)
		land({ repository, host: recordingHost().host, draft: true })
		const pushed = tipOf(repository)
		landOnOrigin({ origin: repository.origin, files: { 'src/two.ts': 'export {}\n' } })

		land({
			repository,
			host: recordingHost({ existing: pullRequestOf({ state: 'open', head: pushed }) }).host,
			draft: true,
		})

		const landing = JSON.parse(
			readFileSync(join(repository.lotFolder, 'landing.json'), 'utf8'),
		) as {
			head: string
			replaced: string[]
		}
		expect(landing.replaced).toEqual([first, pushed])
		expect(landing.head).toBe(tipOf(repository))
	})

	it('a land with nothing to rebase → no head replaced', () => {
		const repository = landingRepository()

		land({ repository, host: recordingHost().host, draft: true })

		expect(
			JSON.parse(readFileSync(join(repository.lotFolder, 'landing.json'), 'utf8')),
		).toMatchObject({ replaced: [] })
	})

	it('the host refuses to open after a rebase → the head the rebase replaced is kept: the next landing records it', () => {
		const repository = landingRepository()
		landOnOrigin({ origin: repository.origin, files: { 'src/one.ts': 'export {}\n' } })
		const first = tipOf(repository)
		const { host } = recordingHost()
		const refusing: HostAdapter = {
			...host,
			openPullRequest: function refuseOpen() {
				return { refusal: 'the host is down' }
			},
		}
		expect(land({ repository, host: refusing, draft: true }).exitCode).toBe(1)

		land({ repository, host: recordingHost().host, draft: true })

		const landing = JSON.parse(
			readFileSync(join(repository.lotFolder, 'landing.json'), 'utf8'),
		) as {
			replaced: string[]
		}
		expect(landing.replaced).toEqual([first])
	})

	it('an untracked folder of two files → named as two files, whatever git status shows by default', () => {
		const repository = landingRepository()
		writeFiles({
			root: repository.worktree,
			files: { 'src/new/a.ts': 'export {}\n', 'src/new/b.ts': 'export {}\n' },
		})
		git({ root: repository.worktree, args: ['config', 'status.showUntrackedFiles', 'normal'] })

		const landed = land({ repository, host: recordingHost().host, draft: true })

		expect(landed.lines).toContain('uncommitted, not pushed: 2 files')
	})

	it("an untracked file origin's main adds → refused naming the untracked file the rebase would overwrite, not a conflict", () => {
		const repository = landingRepository()
		landOnOrigin({ origin: repository.origin, files: { 'src/other.ts': 'export const o = 1\n' } })
		writeFiles({ root: repository.worktree, files: { 'src/other.ts': 'export const o = 2\n' } })
		const before = tipOf(repository)

		const landed = land({ repository, host: recordingHost().host, draft: true })

		expect(landed.exitCode).toBe(1)
		expect(landed.lines.join('\n')).toContain('would overwrite')
		expect(landed.lines.join('\n')).toContain('src/other.ts')
		expect(landed.lines.join('\n')).not.toContain('conflicts in')
		expect(tipOf(repository)).toBe(before)
		expect(readFileSync(join(repository.worktree, 'src/other.ts'), 'utf8')).toBe(
			'export const o = 2\n',
		)
	})

	it('work in progress and a push refused → the refusal still names the uncommitted files', () => {
		const repository = landingRepository()
		git({ root: repository.worktree, args: ['push', '-q', 'origin', 'feat/x'] })
		git({
			root: repository.worktree,
			args: ['commit', '-q', '--allow-empty', '-m', 'feat(x): more'],
		})
		writeFiles({ root: repository.worktree, files: { 'src/x.test.ts': 'red\n' } })

		const landed = land({ repository, host: recordingHost().host, draft: true })

		expect(landed.exitCode).toBe(1)
		expect(landed.lines).toContain('uncommitted, not pushed: 1 file')
	})

	it('a landing recorded before heads were kept (no replaced) → its next rebasing land records the head it replaced', () => {
		const repository = landingRepository()
		const { host } = recordingHost()
		land({ repository, host, draft: true })
		const pushed = tipOf(repository)
		const path = join(repository.lotFolder, 'landing.json')
		const old = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
		delete old.replaced
		writeFileSync(path, JSON.stringify(old))
		landOnOrigin({ origin: repository.origin, files: { 'src/one.ts': 'export {}\n' } })

		land({
			repository,
			host: recordingHost({ existing: pullRequestOf({ state: 'open', head: pushed }) }).host,
			draft: true,
		})

		expect((JSON.parse(readFileSync(path, 'utf8')) as { replaced: string[] }).replaced).toEqual([
			pushed,
		])
	})

	it('its pull request already open → pushed again and queued, not opened twice', () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost({ existing: pullRequestOf({ state: 'open', head: '' }) })

		land({ repository, host })

		expect(calls).toEqual(['read feat/x', 'queue 7'])
	})

	it('a closed pull request of the branch → a new one opened', () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost({
			existing: pullRequestOf({ state: 'closed', head: '' }),
		})

		land({ repository, host })

		expect(calls).toContain('open feat/x -> main "feat(x): x answers one"')
	})

	it("the recorded pull request merged at the lot's tip → the lot committed (its hand-over entry), nothing pushed", () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost()
		land({ repository, host })
		const merged = recordingHost({
			existing: pullRequestOf({ state: 'merged', head: tipOf(repository) }),
		})

		const landed = land({ repository, host: merged.host })

		expect(landed.exitCode).toBe(0)
		expect(landed.lines.join('\n')).toContain('the lot is committed')
		expect(merged.calls).toEqual(['read 7'])
		expect(
			registeredEntryOf({
				store: handoverStoreOf(repository.worktree),
				folder: repository.lotFolder,
			})?.state,
		).toBe('committed')
		expect(calls.length).toBeGreaterThan(0)
	})

	it('the recorded pull request merged, the lot holding commits since → refused: they land in a new lot, nothing pushed', () => {
		const repository = landingRepository()
		const mergedHead = tipOf(repository)
		recordLanding({ repository, head: mergedHead })
		git({
			root: repository.worktree,
			args: ['commit', '-q', '--allow-empty', '-m', 'feat(x): more'],
		})
		const { host, calls } = recordingHost({
			existing: pullRequestOf({ state: 'merged', head: mergedHead }),
		})

		const landed = land({ repository, host })

		expect(landed.exitCode).toBe(1)
		expect(landed.lines.join('\n')).toContain('they land in a new lot')
		expect(calls).toEqual(['read 7'])
	})

	it("someone else pushed the lot's branch since its last landing → the push refused by the lease, nothing overwritten", () => {
		const repository = landingRepository()
		const { host } = recordingHost()
		land({ repository, host })
		const other = cloneRepository({
			origin: repository.origin,
			into: join(temporaryFolder('dialecte-land-colleague-'), 'c'),
		})
		git({ root: other, args: ['switch', '-q', 'feat/x'] })
		git({ root: other, args: ['commit', '-q', '--allow-empty', '-m', 'feat(x): a colleague'] })
		git({ root: other, args: ['push', '-q', 'origin', 'feat/x'] })
		const colleague = git({ root: other, args: ['rev-parse', 'HEAD'] }).trim()
		git({
			root: repository.worktree,
			args: ['commit', '-q', '--amend', '--allow-empty', '-m', 'feat(x): x answers one, again'],
		})
		const again = recordingHost({ existing: pullRequestOf({ state: 'open', head: '' }) })

		const landed = land({ repository, host: again.host })

		expect(landed.exitCode).toBe(1)
		expect(landed.lines.join('\n')).toContain('the push of feat/x was refused')
		expect(
			git({ root: repository.root, args: ['ls-remote', repository.origin, 'refs/heads/feat/x'] }),
		).toContain(colleague)
	})

	it("the lot's branch pushed by hand before its first landing → refused with the pushed-outside line, nothing overwritten", () => {
		const repository = landingRepository()
		git({ root: repository.worktree, args: ['push', '-q', 'origin', 'feat/x'] })
		git({
			root: repository.worktree,
			args: ['commit', '-q', '--amend', '--allow-empty', '-m', 'feat(x): x answers one, again'],
		})

		const landed = land({ repository, host: recordingHost().host })

		expect(landed.exitCode).toBe(1)
		expect(landed.lines.join('\n')).toContain('feat/x exists on origin, pushed outside lot land')
	})

	it('--draft → opened as a draft, never queued: CI runs on every push while the lot goes on', () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost()

		land({ repository, host, draft: true })

		expect(calls).toEqual(['read feat/x', 'open feat/x -> main "feat(x): x answers one" draft'])
	})

	it('no landing.json before → none left behind by a refused landing', () => {
		const repository = landingRepository()
		git({ root: repository.worktree, args: ['checkout', '-q', '--detach'] })

		land({ repository, host: recordingHost().host })

		expect(existsSync(join(repository.lotFolder, 'landing.json'))).toBe(false)
	})
})

describe(
	'landLot: a branch with nothing beyond the base, and its own earlier push',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		/** The lot's branch on origin, or empty when origin has none. */
		function originBranchOf(repository: LandingRepository): string {
			return git({
				root: repository.root,
				args: ['ls-remote', 'origin', 'refs/heads/feat/x'],
			}).trim()
		}

		it("a branch holding no commit beyond origin's base → refused before any push or pull request", () => {
			const repository = landingRepository()
			git({ root: repository.worktree, args: ['reset', '-q', '--hard', 'main'] })
			const { host, calls } = recordingHost()

			const result = land({ repository, host, draft: true })

			expect({
				exitCode: result.exitCode,
				refused: result.lines.some((line) => line.includes('holds no commit beyond origin/main')),
				origin: originBranchOf(repository),
				opened: calls.filter((call) => call.startsWith('open')),
			}).toEqual({ exitCode: 1, refused: true, origin: '', opened: [] })
		})

		it("origin's branch at a commit the base holds (a push that opened no pull request) → pushed over it, the pull request opened", () => {
			const repository = landingRepository()
			git({ root: repository.root, args: ['push', '-q', 'origin', 'main:refs/heads/feat/x'] })

			const result = land({ repository, host: recordingHost().host, draft: true })

			expect({
				exitCode: result.exitCode,
				origin: originBranchOf(repository).split('\t')[0],
			}).toEqual({
				exitCode: 0,
				origin: tipOf(repository),
			})
		})

		it('a host refusing to open after the push, then the lot landed again with a new commit → its own earlier push recognised, pushed and opened', () => {
			const repository = landingRepository()
			const refusing: HostAdapter = {
				...recordingHost().host,
				openPullRequest: () => ({ refusal: 'gh pr create: offline' }),
			}
			land({ repository, host: refusing, draft: true })
			writeFiles({ root: repository.worktree, files: { 'src/x.ts': 'export const x = 2\n' } })
			git({ root: repository.worktree, args: ['commit', '-qam', 'fix(x): x answers two'] })

			const result = land({ repository, host: recordingHost().host, draft: true })

			expect({
				exitCode: result.exitCode,
				origin: originBranchOf(repository).split('\t')[0],
			}).toEqual({
				exitCode: 0,
				origin: tipOf(repository),
			})
		})
	},
)

describe('confirmLanding', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it("the landing's pull request merged at the head it pushed → the lot's hand-over entry committed, one line naming it", () => {
		const repository = landingRepository()
		land({ repository, host: recordingHost().host })
		const { host } = recordingHost({
			existing: pullRequestOf({ state: 'merged', head: tipOf(repository) }),
		})

		const line = confirmLanding({
			root: repository.worktree,
			lotFolder: repository.lotFolder,
			host,
		})

		expect(line).toContain('pull request #7 merged')
		expect(
			registeredEntryOf({
				store: handoverStoreOf(repository.worktree),
				folder: repository.lotFolder,
			})?.state,
		).toBe('committed')
	})

	it('a host that cannot say → nothing changes, one line saying the lot stays pending', () => {
		const repository = landingRepository()
		land({ repository, host: recordingHost().host })
		const silent: HostAdapter = {
			...recordingHost().host,
			readPullRequest: () => ({ refusal: 'gh pr view: offline' }),
		}

		const line = confirmLanding({
			root: repository.worktree,
			lotFolder: repository.lotFolder,
			host: silent,
		})

		expect(line).toContain('the host could not say whether it merged (gh pr view: offline)')
		expect(
			registeredEntryOf({
				store: handoverStoreOf(repository.worktree),
				folder: repository.lotFolder,
			})?.state,
		).toBe('pending')
	})

	it("the landing's pull request merged at another head → nothing marked, a line naming the heads", () => {
		const repository = landingRepository()
		land({ repository, host: recordingHost().host })
		const { host } = recordingHost({
			existing: pullRequestOf({ state: 'merged', head: 'f'.repeat(40) }),
		})

		const line = confirmLanding({
			root: repository.worktree,
			lotFolder: repository.lotFolder,
			host,
		})

		expect({
			line: line?.startsWith(
				`pull request #7 merged at ${'f'.repeat(12)}, the lot holds commits since (`,
			),
			state: registeredEntryOf({
				store: handoverStoreOf(repository.worktree),
				folder: repository.lotFolder,
			})?.state,
		}).toEqual({ line: true, state: 'pending' })
	})

	it("the landing's pull request still open → nothing marked, no line", () => {
		const repository = landingRepository()
		land({ repository, host: recordingHost().host })
		const { host } = recordingHost({
			existing: pullRequestOf({ state: 'open', head: 'f'.repeat(40) }),
		})

		const line = confirmLanding({
			root: repository.worktree,
			lotFolder: repository.lotFolder,
			host,
		})

		expect({
			line,
			state: registeredEntryOf({
				store: handoverStoreOf(repository.worktree),
				folder: repository.lotFolder,
			})?.state,
		}).toEqual({ line: undefined, state: 'pending' })
	})
})
