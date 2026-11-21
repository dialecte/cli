/** A repository with a bare origin and a lot worktree on its own branch, and a host that records what it is asked. */
import { join } from 'node:path'

import { TEMPLATE_PATH } from '../src/lib/pr/change-request.constants.ts'
import { cliTemplate } from './lot-pr.ts'
import { commitEmpty } from './rule-gaps-base-branch.ts'
import {
	cloneRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from './scratch-repository.ts'

import type {
	HostAdapter,
	ChangeRequest,
	ChangeRequestChecks,
	ReviewComment,
} from '../src/lib/host/host.types.ts'
import type {
	LandingRepository,
	RecordingHost,
	RefusableCall,
	StackedRepository,
} from './land-lot.types.ts'

/**
 * `main` (holding the cli's pull request template, or `template` when given; none for `null`) pushed to a bare origin,
 * a worktree on `feat/x` one commit ahead (`src/x.ts`), and the lot's store folder whose brief names the lot's commit
 * messages (`messages`; the commit's own subject when left out).
 */
export function landingRepository(
	params: { messages?: string[]; template?: string | null } = {},
): LandingRepository {
	const folder = temporaryFolder('dialecte-land-')
	const origin = join(folder, 'origin.git')
	const template = params.template === undefined ? cliTemplate() : params.template
	const root = initializeRepository({
		root: join(folder, 'repo'),
		files: template === null ? {} : { [TEMPLATE_PATH]: template },
	})
	git({ root: folder, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root, args: ['remote', 'add', 'origin', origin] })
	git({ root, args: ['push', '-q', '-u', 'origin', 'main'] })
	const worktree = join(folder, 'lot')
	git({ root, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree, 'main'] })
	writeFiles({ root: worktree, files: { 'src/x.ts': 'export const x = 1\n' } })
	git({ root: worktree, args: ['add', 'src/x.ts'] })
	git({ root: worktree, args: ['commit', '-qm', 'feat(x): x answers one'] })
	const lotFolder = temporaryFolder('dialecte-land-lot-')
	const messages = params.messages ?? ['feat(x): x answers one']
	writeFiles({
		root: lotFolder,
		files: {
			'brief.json': JSON.stringify({
				lots: messages.map((message) => ({ paths: ['src/x.ts'], message })),
			}),
		},
	})
	return { root, origin, worktree, lotFolder }
}

/** The url the fake host gives pull request `number`. */
export function changeRequestUrlOf(number: number): string {
	return `https://host.test/pull/${number}`
}

/**
 * A stack of two lots in one store: the parent lot `0001-repo-x` (the landing repository's `feat/x`) pushed to origin
 * with pull request #5 recorded in its `landing.json` (none when `parentLanded` is false), and the child lot
 * `0002-repo-y` on `feat/y`, one commit (`src/y.ts`) on the parent's tip, its `stack.json` naming the parent only. The
 * child's own files are `childFiles` when given.
 */
export function stackedRepository(
	params: { parentLanded?: boolean; childFiles?: Record<string, string> } = {},
): StackedRepository {
	const parent = landingRepository()
	const { root, origin } = parent
	git({ root: parent.worktree, args: ['push', '-q', '-u', 'origin', 'feat/x'] })
	const tip = git({ root: parent.worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const store = temporaryFolder('dialecte-stack-store-')
	const parentFolder = join(store, '0001-repo-x')
	writeFiles({
		root: parentFolder,
		files: {
			'identity.json': JSON.stringify({
				name: '0001-repo-x',
				branch: 'feat/x',
				base: { ref: 'main', commit: git({ root, args: ['rev-parse', 'main'] }).trim() },
			}),
			...(params.parentLanded !== false && {
				'landing.json': JSON.stringify({
					schema: 1,
					number: 5,
					url: changeRequestUrlOf(5),
					branch: 'feat/x',
					head: tip,
					at: '',
				}),
			}),
		},
	})
	const worktree = join(root, '..', 'child')
	git({ root, args: ['worktree', 'add', '-q', '-b', 'feat/y', worktree, 'feat/x'] })
	const childFiles = params.childFiles ?? { 'src/y.ts': 'export const y = 2\n' }
	writeFiles({ root: worktree, files: childFiles })
	git({ root: worktree, args: ['add', '-A'] })
	git({ root: worktree, args: ['commit', '-qm', 'feat(y): y answers two'] })
	const childFolder = join(store, '0002-repo-y')
	writeFiles({
		root: childFolder,
		files: {
			'brief.json': JSON.stringify({
				lots: [{ paths: Object.keys(childFiles), message: 'feat(y): y answers two' }],
			}),
			'stack.json': JSON.stringify({ schema: 1, parent: '0001-repo-x' }),
		},
	})
	return {
		root,
		origin,
		store,
		parent: { worktree: parent.worktree, lotFolder: parentFolder, tip },
		child: { worktree, lotFolder: childFolder },
	}
}

/** The open pull request #5 of the stack's parent `feat/x` (`state` when given). */
export function parentChangeRequest(
	params: { state?: ChangeRequest['state'] } = {},
): ChangeRequest {
	return {
		number: 5,
		url: changeRequestUrlOf(5),
		title: 'feat(x): x answers one',
		body: '',
		state: params.state ?? 'open',
		draft: true,
		queued: false,
		head: '',
		base: 'main',
	}
}

/** A commit pushed to origin's main from another clone (what a queue landing leaves). */
export function landOnOrigin(params: { origin: string; files?: Record<string, string> }): string {
	const other = join(temporaryFolder('dialecte-land-other-'), 'other')
	cloneRepository({ origin: params.origin, into: other })
	if (params.files) {
		writeFiles({ root: other, files: params.files })
		git({ root: other, args: ['add', '-A'] })
		git({ root: other, args: ['commit', '-qm', 'feat: landed by the queue'] })
	} else commitEmpty({ root: other, message: 'feat: landed by the queue' })
	git({ root: other, args: ['push', '-q', 'origin', 'main'] })
	return git({ root: other, args: ['rev-parse', 'HEAD'] }).trim()
}

/** A host that answers from memory and records each call, and the body of each pull request it opens. */
export function recordingHost(
	params: {
		existing?: ChangeRequest
		/** The host's refusal of an edit; edits are taken when absent. */
		editRefusal?: string
		/** The checks on the pull request's head; none when absent. */
		checks?: ChangeRequestChecks
		/** The pull request's line comments; none when absent. */
		comments?: ReviewComment[]
		/** The host's refusal of a queue; queued when absent. */
		queueRefusal?: string
		/** Whether the host links stacks; when not, why (the default: no stacks). */
		stacks?: true | string
		/** A stack parent's pull request, answered when read by its number or by `parentBranch`. */
		parent?: ChangeRequest
		/** The stack parent's branch, which reads its pull request as gh reads a branch's newest. */
		parentBranch?: string
		/** The pull requests in the merge queue without auto-merge, by number (none when absent). */
		mergeQueue?: readonly number[]
		/** The host's refusal of each call named (any call that may answer a refusal); taken when absent. */
		refusals?: Partial<Record<RefusableCall, string>>
		/** How many stack links the host refuses before it takes one. */
		linkRefusals?: number
	} = {},
): RecordingHost {
	const calls: string[] = []
	const bodies: string[] = []
	let changeRequest = params.existing
	let parent = params.parent
	let linkRefusals = params.linkRefusals ?? 0
	const host: HostAdapter = {
		readChangeRequest: function readChangeRequest(call) {
			calls.push(`read ${call.ref}`)
			if (
				parent !== undefined &&
				(call.ref === String(parent.number) || call.ref === params.parentBranch)
			)
				return parent
			return changeRequest
		},
		openChangeRequest: function openChangeRequest(call) {
			calls.push(`open ${call.branch} -> ${call.base} "${call.title}"${call.draft ? ' draft' : ''}`)
			bodies.push(call.body)
			changeRequest = {
				title: call.title,
				body: call.body,
				number: 7,
				url: changeRequestUrlOf(7),
				state: 'open',
				draft: call.draft,
				queued: false,
				head: '',
				base: call.base,
			}
			return changeRequest
		},
		editChangeRequest: function editChangeRequest(call) {
			calls.push(`edit ${call.number} "${call.title}"`)
			if (params.editRefusal !== undefined) return { refusal: params.editRefusal }
			bodies.push(call.body)
			if (changeRequest !== undefined)
				changeRequest = { ...changeRequest, title: call.title, body: call.body }
			return undefined
		},
		closeChangeRequest: function closeChangeRequest(call) {
			calls.push(`close ${call.number}`)
			return undefined
		},
		queueChangeRequest: function queueChangeRequest(call) {
			calls.push(`queue ${call.number}`)
			if (params.queueRefusal !== undefined) return { refusal: params.queueRefusal }
			return undefined
		},
		draftChangeRequest: function draftChangeRequest(call) {
			calls.push(
				`draft-back ${call.number}${call.queued ? ' queued' : ''}${call.draft ? ' draft' : ' ready'}`,
			)
			if (changeRequest !== undefined)
				changeRequest = { ...changeRequest, draft: true, queued: false }
			return undefined
		},
		// a read the calls leave out: queued when the fake's pull request or parent is, or in its merge queue
		readQueued: function readQueued(call) {
			const known = [changeRequest, parent].find(
				(changeRequest) => changeRequest?.number === call.number,
			)
			return { queued: known?.queued === true || (params.mergeQueue ?? []).includes(call.number) }
		},
		readChecks: function readChecks(call) {
			calls.push(`checks ${call.number}`)
			return (
				params.checks ?? {
					head: changeRequest?.head ?? '',
					state: 'none',
					failing: [],
					pending: [],
				}
			)
		},
		readReviewComments: function readReviewComments(call) {
			calls.push(`comments ${call.number}`)
			return params.comments ?? []
		},
		openFiles: function openFiles(call) {
			calls.push(`files ${call.url}`)
			return undefined
		},
		probeStacks: function probeStacks() {
			calls.push('probe')
			return params.stacks === true
				? { stacks: true }
				: { stacks: false, why: params.stacks ?? 'no stacks on this host' }
		},
		linkStack: function linkStack(call) {
			calls.push(`link ${call.parent} ${call.child}`)
			if (linkRefusals === 0) return undefined
			linkRefusals -= 1
			return { refusal: 'gh stack link: the host refused the link' }
		},
		queueStack: function queueStack(call) {
			calls.push(`stack-queue ${call.number}`)
			return undefined
		},
		retargetChangeRequest: function retargetChangeRequest(call) {
			calls.push(`retarget ${call.number} ${call.base}`)
			if (changeRequest !== undefined) changeRequest = { ...changeRequest, base: call.base }
			return undefined
		},
	}
	for (const [name, refusal] of Object.entries(params.refusals ?? {}))
		Object.assign(host, {
			[name]: function refusedCall() {
				calls.push(`${name} refused`)
				return { refusal }
			},
		})
	return {
		host,
		calls,
		bodies,
		setParent: function setParent(next: ChangeRequest) {
			parent = next
		},
		setChangeRequest: function setChangeRequest(next: ChangeRequest) {
			changeRequest = next
		},
	}
}
