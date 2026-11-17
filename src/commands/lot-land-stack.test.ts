/**
 * A stacked lot lands as a stack (33CI CI4). Its pull request is based on the parent's branch, linked to the parent's as
 * a native stack when the host has stacks (a note says why not otherwise), and its body names the parent's pull
 * request. It is rebased onto the parent's new tip when the parent moved, queued as a stack while the parent is open
 * (refused without native stacks), and rebased off the parent's commits once the parent merged: by the cli for a
 * based-on-branch stack, following the host's own rewrite for a native one. A conflict stops, nothing resolved.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import {
	landingRepository,
	landOnOrigin,
	parentPullRequest,
	pullUrlOf,
	recordingHost,
	stackedRepository,
} from '../../test/land-lot.ts'
import { cliTemplate } from '../../test/lot-pr.ts'
import { cloneRepository, git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import {
	findHandoverStore,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'
import { landLot } from '../lib/handover/land-lot.ts'
import { readLanded } from '../lib/landing/landed-record.ts'
import { templateFaultOf } from '../lib/pr/compose-pull-request.ts'
import { TEMPLATE_PATH } from '../lib/pr/pull-request.constants.ts'
import { runLotLand } from './lot-land.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RecordingHost, StackedRepository } from '../../test/land-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T22:00:00Z')
const CHILD = '0002-repo-y'
const PARENT = '0001-repo-x'

/** `landLot` of the stack's child `feat/y` into main. */
function landChild(params: { stack: StackedRepository; host: RecordingHost; draft: boolean }) {
	return landLot({
		lot: CHILD,
		worktree: params.stack.child.worktree,
		branch: 'feat/y',
		base: 'main',
		lotFolder: params.stack.child.lotFolder,
		host: params.host.host,
		draft: params.draft,
		now: NOW,
	})
}

/** The calls the host was asked, reads left out. */
function writesOf(host: RecordingHost): string[] {
	return host.calls.filter((call) => !call.startsWith('read '))
}

/** A commit in the worktree: `files` written, committed with `message`; its sha. */
function commitIn(params: {
	worktree: string
	files: Record<string, string>
	message: string
}): string {
	writeFiles({ root: params.worktree, files: params.files })
	git({ root: params.worktree, args: ['add', '-A'] })
	git({ root: params.worktree, args: ['commit', '-qm', params.message] })
	return git({ root: params.worktree, args: ['rev-parse', 'HEAD'] }).trim()
}

/** The worktree's last commit amended with `files`: its new sha. */
function amendIn(params: { worktree: string; files: Record<string, string> }): string {
	writeFiles({ root: params.worktree, files: params.files })
	git({ root: params.worktree, args: ['add', '-A'] })
	git({ root: params.worktree, args: ['commit', '-q', '--amend', '--no-edit'] })
	return git({ root: params.worktree, args: ['rev-parse', 'HEAD'] }).trim()
}

/** What origin holds for a branch; empty when it holds none. */
function originHead(params: { stack: StackedRepository; branch: string }): string {
	return git({
		root: params.stack.root,
		args: ['ls-remote', params.stack.origin, `refs/heads/${params.branch}`],
	})
		.split('\t')[0]
		.trim()
}

/** The stack record of the child, as written. */
function childStack(stack: StackedRepository): unknown {
	return JSON.parse(readFileSync(join(stack.child.lotFolder, 'stack.json'), 'utf8'))
}

/** The stack record a start writes: the parent, nothing else. */
const PARENT_ONLY = { schema: 1, parent: '0001-repo-x' }

/** The child's HEAD. */
function childHead(stack: StackedRepository): string {
	return git({ root: stack.child.worktree, args: ['rev-parse', 'HEAD'] }).trim()
}

/** The parent squash-merged by the queue: its change landed on origin's main as one commit (`extra` files with it). */
function squashParent(params: {
	stack: StackedRepository
	extra?: Record<string, string>
}): string {
	return landOnOrigin({
		origin: params.stack.origin,
		files: { 'src/x.ts': 'export const x = 1\n', ...params.extra },
	})
}

/**
 * What the host does to a native stack's top once its bottom merged: origin's `feat/y` rebased onto origin's main off
 * the parent's tip (`extra` committed on top, as an edit made on the host); the rewritten head.
 */
function hostRewritesChild(params: {
	stack: StackedRepository
	extra?: Record<string, string>
}): string {
	const clone = join(temporaryFolder('dialecte-stack-host-'), 'host')
	cloneRepository({ origin: params.stack.origin, into: clone })
	git({ root: clone, args: ['checkout', '-q', 'feat/y'] })
	git({
		root: clone,
		args: ['rebase', '-q', '--onto', 'origin/main', params.stack.parent.tip],
	})
	if (params.extra)
		commitIn({ worktree: clone, files: params.extra, message: 'fix(y): edited on the host' })
	git({ root: clone, args: ['push', '-q', '--force', 'origin', 'feat/y'] })
	return git({ root: clone, args: ['rev-parse', 'HEAD'] }).trim()
}

describe('a stacked lot lands as a stack', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('lot land --draft, host with stacks → its pull request opened on the parent branch, then linked to the parent as a stack', () => {
		const stack = stackedRepository()
		const host = recordingHost({ stacks: true, parent: parentPullRequest() })

		const landed = landChild({ stack, host, draft: true })

		expect({ exitCode: landed.exitCode, writes: writesOf(host) }).toEqual({
			exitCode: 0,
			writes: [
				'probe',
				'open feat/y -> feat/x "feat(y): y answers two" draft',
				`link ${pullUrlOf(5)} ${pullUrlOf(7)}`,
			],
		})
	})

	it('lot land --draft, host without stacks → its pull request opened on the parent branch, one note line saying why', () => {
		const stack = stackedRepository()
		const host = recordingHost({ parent: parentPullRequest() })

		const landed = landChild({ stack, host, draft: true })

		expect({
			exitCode: landed.exitCode,
			writes: writesOf(host),
			note: landed.lines.filter((line) => line.startsWith('stacked on')),
		}).toEqual({
			exitCode: 0,
			writes: ['probe', 'open feat/y -> feat/x "feat(y): y answers two" draft'],
			note: ['stacked on #5 through its base branch feat/x: no stacks on this host'],
		})
	})

	it("a stacked lot's pull request body → its depends-on part names the parent's pull request", () => {
		const stack = stackedRepository()
		const host = recordingHost({ parent: parentPullRequest() })

		landChild({ stack, host, draft: true })

		expect(host.bodies[0]).toContain('### Depends on\n\n#5\n')
	})

	it('a lot with no stack → its depends-on part reads not recorded', () => {
		const repository = landingRepository()
		const host = recordingHost()

		landLot({
			...repository,
			lot: '0001-repo-x',
			branch: 'feat/x',
			base: 'main',
			host: host.host,
			draft: true,
			now: NOW,
		})

		expect(host.bodies[0]).toContain('### Depends on\n\nnot recorded\n')
	})

	it("the parent moved on, the child not rebased → lot land --draft rebases onto the parent's tip, no replay, stack.json naming the parent only", () => {
		const stack = stackedRepository()
		const moved = commitIn({
			worktree: stack.parent.worktree,
			files: { 'src/w.ts': 'export const w = 3\n' },
			message: 'feat(x): w too',
		})
		const host = recordingHost({ parent: parentPullRequest() })

		const landed = landChild({ stack, host, draft: true })

		expect({
			exitCode: landed.exitCode,
			onNewTip: git({ root: stack.child.worktree, args: ['rev-parse', 'HEAD~1'] }).trim(),
			ownCommits: git({
				root: stack.child.worktree,
				args: ['rev-list', '--count', `${moved}..HEAD`],
			}).trim(),
			stack: childStack(stack),
			pushed: originHead({ stack, branch: 'feat/y' }) === childHead(stack),
		}).toEqual({ exitCode: 0, onNewTip: moved, ownCommits: '1', stack: PARENT_ONLY, pushed: true })
	})

	it("that rebase onto the parent's new tip conflicts → stops naming the files, the rebase undone, nothing pushed, exit 2", () => {
		const stack = stackedRepository({ childFiles: { 'src/x.ts': 'export const x = 2\n' } })
		commitIn({
			worktree: stack.parent.worktree,
			files: { 'src/x.ts': 'export const x = 3\n' },
			message: 'feat(x): x answers three',
		})
		const before = childHead(stack)
		const host = recordingHost({ parent: parentPullRequest() })

		const landed = landChild({ stack, host, draft: true })

		expect({
			exitCode: landed.exitCode,
			named: landed.lines.some((line) => line.includes('conflicts in src/x.ts')),
			head: childHead(stack),
			status: git({ root: stack.child.worktree, args: ['status', '--porcelain'] }),
			stack: childStack(stack),
			pushed: originHead({ stack, branch: 'feat/y' }),
		}).toEqual({
			exitCode: 2,
			named: true,
			head: before,
			status: '',
			stack: PARENT_ONLY,
			pushed: '',
		})
	})

	it('a parent with no pull request yet → refused naming the landing it waits for, nothing pushed', () => {
		const stack = stackedRepository({ parentLanded: false })
		const host = recordingHost()

		const landed = landChild({ stack, host, draft: true })

		expect({
			exitCode: landed.exitCode,
			lines: landed.lines,
			pushed: originHead({ stack, branch: 'feat/y' }),
		}).toEqual({
			exitCode: 1,
			lines: [
				`lot land: ${CHILD} stacks on ${PARENT}, which has no pull request yet: lot land ${PARENT} --draft first, nothing pushed`,
			],
			pushed: '',
		})
	})
})

describe(
	'a stacked lot queues as a stack, or after its parent merged',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('lot land while the parent is open, native stack → queued as a stack, never auto-merge', () => {
			const stack = stackedRepository()
			const host = recordingHost({ stacks: true, parent: parentPullRequest() })

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				stackQueued: writesOf(host).includes('stack-queue 7'),
				autoQueued: writesOf(host).includes('queue 7'),
			}).toEqual({ exitCode: 0, stackQueued: true, autoQueued: false })
		})

		it('lot land while the parent is open, no native stacks → refused: waits for the parent, nothing pushed or opened', () => {
			const stack = stackedRepository()
			const host = recordingHost({ parent: parentPullRequest() })

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				lines: landed.lines,
				writes: writesOf(host),
				pushed: originHead({ stack, branch: 'feat/y' }),
			}).toEqual({
				exitCode: 1,
				lines: [
					`lot land: ${CHILD} waits for #5 (${PARENT}) to merge: without native stacks a stacked lot queues after its parent, nothing pushed`,
				],
				writes: ['probe'],
				pushed: '',
			})
		})

		it('the parent squash-merged, based on its branch → rebased off the parent onto origin/main, pushed, retargeted to main, queued', () => {
			const stack = stackedRepository()
			const host = recordingHost({ parent: parentPullRequest() })
			landChild({ stack, host, draft: true })
			const merged = squashParent({ stack })
			host.setParent(parentPullRequest({ state: 'merged' }))
			host.calls.length = 0

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				ownCommits: git({
					root: stack.child.worktree,
					args: ['rev-list', '--count', `${merged}..HEAD`],
				}).trim(),
				onMain: git({ root: stack.child.worktree, args: ['rev-parse', 'HEAD~1'] }).trim(),
				changed: git({
					root: stack.child.worktree,
					args: ['diff', '--name-only', merged, 'HEAD'],
				}).trim(),
				pushed: originHead({ stack, branch: 'feat/y' }) === childHead(stack),
				stack: childStack(stack),
				writes: writesOf(host),
			}).toEqual({
				exitCode: 0,
				ownCommits: '1',
				onMain: merged,
				changed: 'src/y.ts',
				pushed: true,
				stack: PARENT_ONLY,
				writes: ['retarget 7 main', 'queue 7'],
			})
		})

		it('the parent squash-merged and the host retargeted the pull request already → no retarget asked', () => {
			const stack = stackedRepository()
			const host = recordingHost({ parent: parentPullRequest() })
			landChild({ stack, host, draft: true })
			squashParent({ stack })
			host.setParent(parentPullRequest({ state: 'merged' }))
			host.host.retargetPullRequest({ root: stack.root, number: 7, base: 'main' })
			host.calls.length = 0

			const landed = landChild({ stack, host, draft: false })

			expect({ exitCode: landed.exitCode, writes: writesOf(host) }).toEqual({
				exitCode: 0,
				writes: ['queue 7'],
			})
		})

		it('the rebase off the merged parent conflicts → stops naming the files, the rebase undone, nothing pushed, exit 2', () => {
			const stack = stackedRepository()
			const host = recordingHost({ parent: parentPullRequest() })
			landChild({ stack, host, draft: true })
			const pushed = originHead({ stack, branch: 'feat/y' })
			squashParent({ stack, extra: { 'src/y.ts': 'export const y = 9\n' } })
			host.setParent(parentPullRequest({ state: 'merged' }))
			const before = childHead(stack)

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				named: landed.lines.some((line) => line.includes('conflicts in src/y.ts')),
				head: childHead(stack),
				status: git({ root: stack.child.worktree, args: ['status', '--porcelain'] }),
				pushed: originHead({ stack, branch: 'feat/y' }),
			}).toEqual({ exitCode: 2, named: true, head: before, status: '', pushed })
		})

		it("the parent merged, native stack, nothing local beyond the pushed head → the child follows the host's rewrite, nothing pushed", () => {
			const stack = stackedRepository()
			const host = recordingHost({ stacks: true, parent: parentPullRequest() })
			landChild({ stack, host, draft: true })
			squashParent({ stack })
			const rewritten = hostRewritesChild({ stack })
			host.setParent(parentPullRequest({ state: 'merged' }))
			host.calls.length = 0

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				head: childHead(stack),
				pushed: originHead({ stack, branch: 'feat/y' }),
				queued: writesOf(host).includes('stack-queue 7'),
			}).toEqual({
				exitCode: 0,
				head: rewritten,
				pushed: rewritten,
				queued: true,
			})
		})

		it("the parent merged, native stack, a local commit beyond the pushed head → rebased onto the host's rewrite, pushed with it as the lease", () => {
			const stack = stackedRepository()
			const host = recordingHost({ stacks: true, parent: parentPullRequest() })
			landChild({ stack, host, draft: true })
			commitIn({
				worktree: stack.child.worktree,
				files: { 'src/z.ts': 'export const z = 4\n' },
				message: 'feat(y): z',
			})
			squashParent({ stack })
			const rewritten = hostRewritesChild({ stack })
			host.setParent(parentPullRequest({ state: 'merged' }))

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				onRewrite: git({ root: stack.child.worktree, args: ['rev-parse', 'HEAD~1'] }).trim(),
				pushed: originHead({ stack, branch: 'feat/y' }) === childHead(stack),
			}).toEqual({ exitCode: 0, onRewrite: rewritten, pushed: true })
		})

		it("the parent merged, native stack, a local commit that conflicts with the host's branch → stops naming the files, nothing pushed, exit 2", () => {
			const stack = stackedRepository()
			const host = recordingHost({ stacks: true, parent: parentPullRequest() })
			landChild({ stack, host, draft: true })
			commitIn({
				worktree: stack.child.worktree,
				files: { 'src/y.ts': 'export const y = 5\n' },
				message: 'fix(y): five',
			})
			squashParent({ stack })
			const rewritten = hostRewritesChild({ stack, extra: { 'src/y.ts': 'export const y = 6\n' } })
			host.setParent(parentPullRequest({ state: 'merged' }))
			const before = childHead(stack)

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				named: landed.lines.some((line) => line.includes('conflicts in src/y.ts')),
				head: childHead(stack),
				status: git({ root: stack.child.worktree, args: ['status', '--porcelain'] }),
				pushed: originHead({ stack, branch: 'feat/y' }),
			}).toEqual({ exitCode: 2, named: true, head: before, status: '', pushed: rewritten })
		})
	},
)

/**
 * A stack of two store lots of a brief workspace pushed to a bare origin: the parent `0001-repo-x` on `feat/x` (one
 * commit, pushed, pull request #5 in its landing.json) and the child `0002-repo-y` on `feat/y`, cut at the parent's tip
 * with one commit, its stack.json naming the parent.
 */
function storeStack() {
	const workspace = createBriefWorkspace()
	const { repository } = workspace
	writeFiles({ root: repository, files: { [TEMPLATE_PATH]: cliTemplate() } })
	git({ root: repository, args: ['add', '-A'] })
	git({ root: repository, args: ['commit', '-qm', 'chore: the template'] })
	const origin = join(workspace.workspace, 'origin.git')
	git({ root: workspace.workspace, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root: repository, args: ['remote', 'add', 'origin', origin] })
	git({ root: repository, args: ['push', '-q', '-u', 'origin', 'main'] })
	const parentWorktree = join(workspace.workspace, '.worktrees', PARENT)
	git({
		root: repository,
		args: ['worktree', 'add', '-q', '-b', 'feat/x', parentWorktree, 'main'],
	})
	const tip = commitIn({
		worktree: parentWorktree,
		files: { 'src/x.ts': 'export const x = 1\n' },
		message: 'feat(x): x answers one',
	})
	git({ root: parentWorktree, args: ['push', '-q', '-u', 'origin', 'feat/x'] })
	const parentFolder = writeStoreLot({
		workspace,
		name: PARENT,
		scope: ['src/x.ts'],
		branch: 'feat/x',
		repository,
		worktree: parentWorktree,
	})
	writeFileSync(
		join(parentFolder, 'landing.json'),
		JSON.stringify({
			schema: 1,
			number: 5,
			url: pullUrlOf(5),
			branch: 'feat/x',
			head: tip,
			at: '',
		}),
	)
	const childWorktree = join(workspace.workspace, '.worktrees', CHILD)
	git({ root: repository, args: ['worktree', 'add', '-q', '-b', 'feat/y', childWorktree, tip] })
	commitIn({
		worktree: childWorktree,
		files: { 'src/y.ts': 'export const y = 2\n' },
		message: 'feat(y): y',
	})
	const childFolder = writeStoreLot({
		workspace,
		name: CHILD,
		scope: ['src/y.ts'],
		branch: 'feat/y',
		repository,
		worktree: childWorktree,
		base: { ref: 'feat/x', commit: tip },
	})
	writeFileSync(join(childFolder, 'stack.json'), JSON.stringify({ schema: 1, parent: PARENT }))
	return { repository, parentWorktree, parentFolder, childWorktree, tip }
}

describe('dialecte lot land of a stacked store lot', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a lot started on its parent (stack.json), cut from a commit main does not hold → landed on the parent branch, not refused', () => {
		const stack = storeStack()
		const host = recordingHost({ parent: parentPullRequest() })

		const result = runLotLand({ cwd: stack.repository, argv: [CHILD, '--draft'], host: host.host })

		expect({
			exitCode: result.exitCode,
			opened: writesOf(host).filter((call) => call.startsWith('open')),
		}).toEqual({
			exitCode: 0,
			opened: ['open feat/y -> feat/x "feat: x" draft'],
		})
	})

	it("a parent the registry records committed (its hand-over run), pushed and not merged → the child keeps the parent's files, never rebased off it", () => {
		const stack = storeStack()
		registerHandover({
			root: stack.parentWorktree,
			folder: stack.parentFolder,
			branch: 'feat/x',
			now: NOW,
		})
		recordHandoverState({
			store: findHandoverStore(stack.parentWorktree),
			folder: stack.parentFolder,
			state: 'committed',
		})
		const host = recordingHost({ parent: parentPullRequest() })

		const result = runLotLand({ cwd: stack.repository, argv: [CHILD, '--draft'], host: host.host })

		expect({
			exitCode: result.exitCode,
			parentFiles: existsSync(join(stack.childWorktree, 'src/x.ts')),
			offParent: result.output.includes('merged)'),
		}).toEqual({ exitCode: 0, parentFiles: true, offParent: false })
	})

	it("the parent's pull request merged as the host says → lot land of the child records the parent's landed fact", () => {
		const stack = storeStack()
		const host = recordingHost({
			parent: { ...parentPullRequest({ state: 'merged' }), head: stack.tip },
		})

		const result = runLotLand({ cwd: stack.repository, argv: [CHILD, '--draft'], host: host.host })

		expect({
			exitCode: result.exitCode,
			landed: readLanded({ lotFolder: stack.parentFolder }),
		}).toMatchObject({
			exitCode: 0,
			landed: { how: 'host', tip: stack.tip, base: 'main', pull: { number: 5 } },
		})
	})
})

describe(
	'the native route once linked or merged, refusals that write nothing, a damaged stack record',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('host with stacks, the parent merged before the child ever landed → rebased off the parent onto origin/main, opened on main, queued with auto-merge', () => {
			const stack = stackedRepository()
			const merged = squashParent({ stack })
			const host = recordingHost({ stacks: true, parent: parentPullRequest({ state: 'merged' }) })

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				onMain: git({ root: stack.child.worktree, args: ['rev-parse', 'HEAD~1'] }).trim(),
				writes: writesOf(host),
			}).toEqual({
				exitCode: 0,
				onMain: merged,
				writes: ['open feat/y -> main "feat(y): y answers two"', 'queue 7'],
			})
		})

		it("a stacked child rebased by hand onto its amended parent, the parent squash-merged → lot land --draft lands only the child's commit", () => {
			const stack = stackedRepository()
			const amended = amendIn({
				worktree: stack.parent.worktree,
				files: { 'src/x.ts': 'export const x = 11\n' },
			})
			git({
				root: stack.child.worktree,
				args: ['rebase', '-q', '--onto', amended, stack.parent.tip],
			})
			commitIn({
				worktree: stack.parent.worktree,
				files: { 'src/x.ts': 'export const x = 12\n' },
				message: 'feat(x): x answers twelve',
			})
			const merged = landOnOrigin({
				origin: stack.origin,
				files: { 'src/x.ts': 'export const x = 12\n' },
			})
			const host = recordingHost({ parent: parentPullRequest({ state: 'merged' }) })

			const landed = landChild({ stack, host, draft: true })

			expect({
				exitCode: landed.exitCode,
				onMain: git({ root: stack.child.worktree, args: ['rev-parse', 'HEAD~1'] }).trim(),
				changed: git({
					root: stack.child.worktree,
					args: ['diff', '--name-only', merged, 'HEAD'],
				}).trim(),
			}).toEqual({ exitCode: 0, onMain: merged, changed: 'src/y.ts' })
		})

		it('a queue refused because the parent is open and the host has no stacks → stack.json left byte for byte', () => {
			const stack = stackedRepository()
			const before = readFileSync(join(stack.child.lotFolder, 'stack.json'), 'utf8')
			const host = recordingHost({ parent: parentPullRequest() })

			const landed = landChild({ stack, host, draft: false })

			expect({
				exitCode: landed.exitCode,
				stack: readFileSync(join(stack.child.lotFolder, 'stack.json'), 'utf8'),
			}).toEqual({ exitCode: 1, stack: before })
		})

		it('a torn stack.json → lot land refuses naming the damage, nothing pushed, nothing asked of the host', () => {
			const stack = stackedRepository()
			writeFileSync(join(stack.child.lotFolder, 'stack.json'), '{"schema":1,"parent":')
			const host = recordingHost({ parent: parentPullRequest() })

			const landed = landChild({ stack, host, draft: true })

			expect({
				exitCode: landed.exitCode,
				lines: landed.lines,
				writes: writesOf(host),
				pushed: originHead({ stack, branch: 'feat/y' }),
			}).toEqual({
				exitCode: 1,
				lines: [
					`lot land: ${CHILD} is damaged: its stack.json does not read as a stack record, nothing pushed`,
				],
				writes: [],
				pushed: '',
			})
		})

		it('a template without the depends marker → refused naming the whole marker', () => {
			const template = cliTemplate().replace('<!-- dialecte:depends -->\n', '')

			expect(templateFaultOf(template)).toBe('missing marker <!-- dialecte:depends -->')
		})
	},
)
