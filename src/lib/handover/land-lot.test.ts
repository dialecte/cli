/**
 * A lot lands through its pull request: checked, rebased onto origin's base when behind, pushed, opened as a draft,
 * recorded; never queued (lot approve queues).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIRST_WORD } from '../../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../../test/forbidden-words-workspace.ts'
import { landingRepository, landOnOrigin, recordingHost } from '../../../test/land-lot.ts'
import { cliTemplate } from '../../../test/lot-pr.ts'
import {
	cloneRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { TEMPLATE_PATH } from '../pr/change-request.constants.ts'
import { readStoreEntries, registeredEntryOf } from './handover-store-read.ts'
import { handoverStoreOf, recordHandoverState, registerHandover } from './handover-store.ts'
import { landLot } from './land-lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

import type { LandingRepository } from '../../../test/land-lot.types.ts'
import type { HostAdapter, ChangeRequest } from '../host/host.types.ts'

const NOW = new Date('2026-11-16T03:00:00Z')

/** `landLot` of the landing repository's lot `feat/x` into main. */
function land(params: { repository: LandingRepository; host: HostAdapter }) {
	return landLot({
		...params.repository,
		lot: '0001-repo-x',
		branch: 'feat/x',
		base: 'main',
		host: params.host,
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

/** A person's approval of pull request #7 at `head`, as `lot approve` appends it to the lot folder. */
function approveHead(params: { repository: LandingRepository; head: string }): void {
	writeFileSync(
		join(params.repository.lotFolder, 'approvals.jsonl'),
		`${JSON.stringify({ schema: 1, at: '', by: 'person-a', number: 7, head: params.head })}\n`,
	)
}

/** Pull request #7 of the lot in `state`, its head at `head`, ready and not queued unless said. */
function changeRequestOf(params: {
	state: ChangeRequest['state']
	head: string
	draft?: boolean
	queued?: boolean
}): ChangeRequest {
	return {
		number: 7,
		url: 'https://host.test/pull/7',
		title: 'feat(x): x answers one',
		body: '',
		state: params.state,
		draft: params.draft ?? false,
		queued: params.queued ?? false,
		head: params.head,
	}
}

describe('landLot', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a lot with no pull request → pushed, opened as a draft with its commit message as title, never queued, the landing and a pending hand-over entry recorded', () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost()

		const landed = land({ repository, host })

		expect(landed.exitCode).toBe(0)
		expect(calls).toEqual(['read feat/x', 'open feat/x -> main "feat(x): x answers one" draft'])
		expect(landed.lines.at(-1)).toBe(
			'a draft: CI runs on every push; dialecte lot approve 0001-repo-x --by <who> queues it once its checks pass',
		)
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

		const landed = land({ repository, host })

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

		const landed = land({ repository, host })

		expect(landed.exitCode).toBe(0)
		expect(tipOf(repository)).toBe(committed)
		expect(landed.lines.join('\n')).toContain(
			'not rebased onto origin/main: the worktree holds uncommitted changes',
		)
		expect(landed.lines).toContain('uncommitted, not pushed: 1 file')
		expect(readFileSync(join(repository.worktree, 'src/x.ts'), 'utf8')).toBe('export const x = 3\n')
	})

	it('an untracked folder of two files → named as two files, whatever git status shows by default', () => {
		const repository = landingRepository()
		writeFiles({
			root: repository.worktree,
			files: { 'src/new/a.ts': 'export {}\n', 'src/new/b.ts': 'export {}\n' },
		})
		git({ root: repository.worktree, args: ['config', 'status.showUntrackedFiles', 'normal'] })

		const landed = land({ repository, host: recordingHost().host })

		expect(landed.lines).toContain('uncommitted, not pushed: 2 files')
	})

	it("an untracked file origin's main adds → refused naming the untracked file the rebase would overwrite, not a conflict", () => {
		const repository = landingRepository()
		landOnOrigin({ origin: repository.origin, files: { 'src/other.ts': 'export const o = 1\n' } })
		writeFiles({ root: repository.worktree, files: { 'src/other.ts': 'export const o = 2\n' } })
		const before = tipOf(repository)

		const landed = land({ repository, host: recordingHost().host })

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

		const landed = land({ repository, host: recordingHost().host })

		expect(landed.exitCode).toBe(1)
		expect(landed.lines).toContain('uncommitted, not pushed: 1 file')
	})

	it.each([
		{
			label: 'ready and queued',
			draft: false,
			queued: true,
			taken: ['draft-back 7 queued ready'],
		},
		{ label: 'ready, not queued', draft: false, queued: false, taken: ['draft-back 7 ready'] },
		{ label: 'a draft, not queued', draft: true, queued: false, taken: [] },
	])(
		'its pull request already open, $label, a new head to push → taken back out of the queue as a draft before the push, not opened twice, never queued',
		({ draft, queued, taken }) => {
			const repository = landingRepository()
			const { host, calls } = recordingHost({
				existing: changeRequestOf({ state: 'open', head: '', draft, queued }),
			})

			land({ repository, host })

			expect(calls).toEqual(['read feat/x', ...taken, 'edit 7 "feat(x): x answers one"'])
		},
	)

	it('its pull request queued at the head pushed again, a person approved that head → left as it is: the approval stands', () => {
		const repository = landingRepository()
		approveHead({ repository, head: tipOf(repository) })
		const { host, calls } = recordingHost({
			existing: changeRequestOf({ state: 'open', head: tipOf(repository), queued: true }),
		})

		const landed = land({ repository, host })

		expect({ exitCode: landed.exitCode, calls }).toEqual({
			exitCode: 0,
			calls: ['read feat/x', 'edit 7 "feat(x): x answers one"'],
		})
	})

	it('its pull request queued at the head pushed again, never approved (an earlier landing stopped after its push) → taken out of the queue: a re-land heals', () => {
		const repository = landingRepository()
		approveHead({ repository, head: 'a'.repeat(40) })
		const { host, calls } = recordingHost({
			existing: changeRequestOf({ state: 'open', head: tipOf(repository), queued: true }),
		})

		const landed = land({ repository, host })

		expect({ exitCode: landed.exitCode, calls }).toEqual({
			exitCode: 0,
			calls: ['read feat/x', 'draft-back 7 queued ready', 'edit 7 "feat(x): x answers one"'],
		})
	})

	it('a queued pull request and the edit refused after the push → exit 1, the pull request already out of the queue', () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost({
			existing: changeRequestOf({ state: 'open', head: '', queued: true }),
			refusals: { editChangeRequest: 'HTTP 502' },
		})

		const landed = land({ repository, host })

		expect({ exitCode: landed.exitCode, calls }).toEqual({
			exitCode: 1,
			calls: ['read feat/x', 'draft-back 7 queued ready', 'editChangeRequest refused'],
		})
	})

	it('a queued pull request the host refuses to take out of the queue → exit 1, nothing pushed, the refusal named', () => {
		const repository = landingRepository()
		const { host } = recordingHost({
			existing: changeRequestOf({ state: 'open', head: '', queued: true }),
			refusals: { draftChangeRequest: 'HTTP 502' },
		})

		const landed = land({ repository, host })

		expect({
			exitCode: landed.exitCode,
			last: landed.lines.at(-1),
			pushed: git({
				root: repository.root,
				args: ['ls-remote', repository.origin, 'refs/heads/feat/x'],
			}),
		}).toEqual({ exitCode: 1, last: 'lot land: HTTP 502', pushed: '' })
	})

	it('its pull request ready, in the merge queue without auto-merge, a new head to push → taken out of the queue before the push', () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost({
			existing: changeRequestOf({ state: 'open', head: '' }),
			mergeQueue: [7],
		})

		land({ repository, host })

		expect(calls).toEqual([
			'read feat/x',
			'draft-back 7 queued ready',
			'edit 7 "feat(x): x answers one"',
		])
	})

	it('a closed pull request of the branch → never reused: a new draft opened, the closed one never taken back', () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost({
			existing: changeRequestOf({ state: 'closed', head: '' }),
		})

		land({ repository, host })

		expect(calls).toEqual(['read feat/x', 'open feat/x -> main "feat(x): x answers one" draft'])
	})

	it("the recorded pull request merged at the lot's tip → the lot committed (its hand-over entry), nothing pushed", () => {
		const repository = landingRepository()
		const { host, calls } = recordingHost()
		land({ repository, host })
		const merged = recordingHost({
			existing: changeRequestOf({ state: 'merged', head: tipOf(repository) }),
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

	it('the recorded pull request merged, the lot holding commits since → committed, its landed fact written, the commits since named: they land in a new lot, nothing pushed', () => {
		const repository = landingRepository()
		const mergedHead = tipOf(repository)
		recordLanding({ repository, head: mergedHead })
		git({
			root: repository.worktree,
			args: ['commit', '-q', '--allow-empty', '-m', 'feat(x): more'],
		})
		const { host, calls } = recordingHost({
			existing: changeRequestOf({ state: 'merged', head: mergedHead }),
		})

		expect({
			landed: land({ repository, host }),
			fact: JSON.parse(readFileSync(join(repository.lotFolder, 'landed.json'), 'utf8')) as unknown,
			calls,
		}).toMatchObject({
			landed: {
				exitCode: 0,
				lines: expect.arrayContaining([
					expect.stringMatching(/1 commit\(s\) made since its landing: .*they land in a new lot/),
				]),
			},
			fact: { how: 'host', tip: mergedHead, changeRequest: { number: 7 } },
			calls: ['read 7'],
		})
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
		const again = recordingHost({ existing: changeRequestOf({ state: 'open', head: '' }) })

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

			const result = land({ repository, host })

			expect({
				exitCode: result.exitCode,
				refused: result.lines.some((line) => line.includes('holds no commit beyond origin/main')),
				origin: originBranchOf(repository),
				opened: calls.filter((call) => call.startsWith('open')),
			}).toEqual({ exitCode: 1, refused: true, origin: '', opened: [] })
		})

		it("a branch holding no commit beyond origin's base → no hand-over entry written for the refused landing", () => {
			const repository = landingRepository()
			git({ root: repository.worktree, args: ['reset', '-q', '--hard', 'main'] })

			land({ repository, host: recordingHost().host })

			expect(
				registeredEntryOf({
					store: handoverStoreOf(repository.worktree),
					folder: repository.lotFolder,
				}),
			).toBeUndefined()
		})

		it('an abandoned entry of the lot and a branch holding no commit beyond the base → refused, the entry left as it was (never rewritten pending)', () => {
			const repository = landingRepository()
			const store = handoverStoreOf(repository.worktree)
			registerHandover({
				root: repository.worktree,
				folder: repository.lotFolder,
				branch: 'feat/x',
				now: NOW,
			})
			recordHandoverState({ store, folder: repository.lotFolder, state: 'abandoned' })
			const before = registeredEntryOf({ store, folder: repository.lotFolder })
			git({ root: repository.worktree, args: ['reset', '-q', '--hard', 'main'] })

			land({ repository, host: recordingHost().host })

			expect(registeredEntryOf({ store, folder: repository.lotFolder })).toEqual(before)
		})

		/** The lot's hand-over entry registered and recorded committed; its registered name. */
		function committedLot(repository: LandingRepository): string {
			const store = handoverStoreOf(repository.worktree)
			const name = registerHandover({
				root: repository.worktree,
				folder: repository.lotFolder,
				branch: 'feat/x',
				now: NOW,
			})
			recordHandoverState({ store, folder: repository.lotFolder, state: 'committed' })
			return name
		}

		it("a committed lot whose branch main holds → the registry's committed answer, the same registering gives, no entry written", () => {
			const repository = landingRepository()
			const store = handoverStoreOf(repository.worktree)
			const name = committedLot(repository)
			git({ root: repository.worktree, args: ['reset', '-q', '--hard', 'main'] })
			const before = readStoreEntries(store)

			const result = land({ repository, host: recordingHost().host })

			expect({
				exitCode: result.exitCode,
				lines: result.lines,
				entries: readStoreEntries(store),
			}).toEqual({
				exitCode: 1,
				lines: [
					`lot land: ${name} is committed: a committed hand-over is never rewritten: nothing pushed`,
				],
				entries: before,
			})
		})

		it('a committed lot whose branch holds a commit beyond the base → the same committed answer, nothing pushed, the entry left as it was', () => {
			const repository = landingRepository()
			const store = handoverStoreOf(repository.worktree)
			const name = committedLot(repository)
			const before = readStoreEntries(store)

			const result = land({ repository, host: recordingHost().host })

			expect({
				exitCode: result.exitCode,
				lines: result.lines,
				entries: readStoreEntries(store),
				origin: git({
					root: repository.root,
					args: ['ls-remote', 'origin', 'refs/heads/feat/x'],
				}).trim(),
			}).toEqual({
				exitCode: 1,
				lines: [
					`lot land: ${name} is committed: a committed hand-over is never rewritten: nothing pushed`,
				],
				entries: before,
				origin: '',
			})
		})

		it("origin's branch at a commit the base holds (a push that opened no pull request) → pushed over it, the pull request opened", () => {
			const repository = landingRepository()
			git({ root: repository.root, args: ['push', '-q', 'origin', 'main:refs/heads/feat/x'] })

			const result = land({ repository, host: recordingHost().host })

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
				openChangeRequest: () => ({ refusal: 'gh pr create: offline' }),
			}
			land({ repository, host: refusing })
			writeFiles({ root: repository.worktree, files: { 'src/x.ts': 'export const x = 2\n' } })
			git({ root: repository.worktree, args: ['commit', '-qam', 'fix(x): x answers two'] })

			const result = land({ repository, host: recordingHost().host })

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

describe(
	'landLot renders the pull request from the lot records',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('a lot with no pull request → opened with the body rendered through the template', () => {
			const repository = landingRepository()
			const { host, bodies } = recordingHost()

			land({ repository, host })

			expect(bodies).toHaveLength(1)
			expect(bodies[0]).toMatch(/^### Summary\n\nnot recorded\n\n### Behaviours\n/)
			expect(bodies[0]).toContain('### Checklist for the reviewer when doing the PR review')
		})

		it('its pull request open with another text → edited to the rendered title and body, the line says so', () => {
			const repository = landingRepository()
			const { host, calls, bodies } = recordingHost({
				existing: {
					...changeRequestOf({ state: 'open', head: '' }),
					title: 'merge: main',
					body: '',
				},
			})

			const landed = land({ repository, host })

			expect(calls).toContain('edit 7 "feat(x): x answers one"')
			expect(bodies[0]).toContain('### Summary')
			expect(landed.lines).toContain('pull request #7 updated from the lot records')
		})

		it('a commit message holding a forbidden word → refused naming the record, nothing pushed', () => {
			configureMachine({ userFileLines: [FIRST_WORD] })
			const repository = landingRepository({ messages: [`feat(x): ${FIRST_WORD} answers`] })
			const { host, calls } = recordingHost()

			const landed = land({ repository, host })

			expect(landed).toEqual({
				exitCode: 1,
				lines: [
					`lot land: the pull request text holds a forbidden word \`${FIRST_WORD}\` in brief.json lots[0].message: rewrite that record, nothing sent`,
				],
			})
			expect(calls).toEqual([])
			expect(
				git({ root: repository.root, args: ['ls-remote', repository.origin, 'refs/heads/feat/x'] }),
			).toBe('')
		})

		it('a repository without the template → refused naming it, nothing pushed', () => {
			const repository = landingRepository({ template: null })
			const { host } = recordingHost()

			const landed = land({ repository, host })

			expect(landed.exitCode).toBe(1)
			expect(landed.lines).toEqual([
				"lot land: the lot's head holds no .github/pull_request_template.md: copy the cli's template into the repository",
			])
			expect(
				git({ root: repository.root, args: ['ls-remote', repository.origin, 'refs/heads/feat/x'] }),
			).toBe('')
		})

		it("main's template changed after the cut so the rebased head no longer renders → refused before the push, nothing pushed", () => {
			const repository = landingRepository()
			landOnOrigin({
				origin: repository.origin,
				files: { [TEMPLATE_PATH]: '### No markers here\n' },
			})
			const { host, calls } = recordingHost()

			const landed = land({ repository, host })

			expect(landed.exitCode).toBe(1)
			expect(calls).not.toContainEqual(expect.stringMatching(/^open /))
			expect(
				git({ root: repository.root, args: ['ls-remote', repository.origin, 'refs/heads/feat/x'] }),
			).toBe('')
		})

		it('a base branch origin does not hold → a refusal line, never a throw', () => {
			const repository = landingRepository()
			const { host, calls } = recordingHost()

			function landOnMissingBase() {
				return landLot({
					...repository,
					lot: '0001-repo-x',
					branch: 'feat/x',
					base: 'release',
					host,
					now: NOW,
				})
			}

			expect(landOnMissingBase).not.toThrow()
			expect(landOnMissingBase()).toEqual({
				exitCode: 1,
				lines: ['lot land: origin holds no branch release to land on: nothing pushed'],
			})
			expect(calls).toEqual([])
		})

		it('a reused pull request that already reads the records → no edit asked', () => {
			const repository = landingRepository()
			const first = recordingHost()
			land({ repository, host: first.host })
			const { host, calls } = recordingHost({
				existing: {
					...changeRequestOf({ state: 'open', head: '' }),
					body: first.bodies[0].replaceAll('\n', '\r\n'),
				},
			})

			land({ repository, host })

			expect(calls).not.toContainEqual(expect.stringMatching(/^edit /))
		})

		it("a person's ticks after the kept marker of the reused pull request → kept in the edited body", () => {
			const repository = landingRepository()
			const kept =
				'### Checklist for the reviewer when doing the PR review\n\n- [x] Tests are complete'
			const { host, bodies } = recordingHost({
				existing: { ...changeRequestOf({ state: 'open', head: '' }), body: `old\n\n${kept}\n` },
			})

			land({ repository, host })

			expect(bodies[0]?.endsWith(`\n\n${kept}`)).toBe(true)
		})

		it('the host refusing the edit of a reused pull request → exit 1, the landing still recorded', () => {
			const repository = landingRepository()
			const { host } = recordingHost({
				existing: { ...changeRequestOf({ state: 'open', head: '' }), body: '' },
				editRefusal: 'gh pr edit: HTTP 403',
			})

			const landed = land({ repository, host })

			expect(landed.exitCode).toBe(1)
			expect(landed.lines.at(-1)).toBe('lot land: gh pr edit: HTTP 403')
			expect(existsSync(join(repository.lotFolder, 'landing.json'))).toBe(true)
		})

		it("a lot cut before main held the template's markers → its early check reads origin's template, it lands after its rebase", () => {
			const repository = landingRepository({ template: null })
			landOnOrigin({ origin: repository.origin, files: { [TEMPLATE_PATH]: cliTemplate() } })
			const { host, calls } = recordingHost()

			const landed = land({ repository, host })

			expect(landed.exitCode).toBe(0)
			expect(calls).toContainEqual(expect.stringMatching(/^open feat\/x -> main /))
		})
	},
)
