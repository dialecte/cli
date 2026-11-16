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
			label: 'uncommitted changes',
			arrange: (repository: LandingRepository) =>
				writeFiles({ root: repository.worktree, files: { 'src/x.ts': 'export const x = 3\n' } }),
			line: 'holds uncommitted changes',
		},
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
		writeFiles({ root: repository.worktree, files: { 'src/x.ts': 'export const x = 3\n' } })

		land({ repository, host: recordingHost().host })

		expect(existsSync(join(repository.lotFolder, 'landing.json'))).toBe(false)
	})
})

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

	it.each([
		{ label: 'merged at another head', state: 'merged' as const },
		{ label: 'still open', state: 'open' as const },
	])("the landing's pull request $label → nothing changes, no line", ({ state }) => {
		const repository = landingRepository()
		land({ repository, host: recordingHost().host })
		const { host } = recordingHost({ existing: pullRequestOf({ state, head: 'f'.repeat(40) }) })

		const line = confirmLanding({
			root: repository.worktree,
			lotFolder: repository.lotFolder,
			host,
		})

		expect(line).toBeUndefined()
		expect(
			registeredEntryOf({
				store: handoverStoreOf(repository.worktree),
				folder: repository.lotFolder,
			})?.state,
		).toBe('pending')
	})
})
