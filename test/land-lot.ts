/** A repository with a bare origin and a lot worktree on its own branch, and a host that records what it is asked. */
import { join } from 'node:path'

import { commitEmpty } from './rule-gaps-base-branch.ts'
import {
	cloneRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from './scratch-repository.ts'

import type { HostAdapter, PullRequest } from '../src/lib/host/host.types.ts'
import type { LandingRepository, RecordingHost } from './land-lot.types.ts'

/** `main` pushed to a bare origin, a worktree on `feat/x` one commit ahead (`src/x.ts`), and the lot's store folder. */
export function landingRepository(): LandingRepository {
	const folder = temporaryFolder('dialecte-land-')
	const origin = join(folder, 'origin.git')
	const root = initializeRepository({ root: join(folder, 'repo') })
	git({ root: folder, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root, args: ['remote', 'add', 'origin', origin] })
	git({ root, args: ['push', '-q', '-u', 'origin', 'main'] })
	const worktree = join(folder, 'lot')
	git({ root, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree, 'main'] })
	writeFiles({ root: worktree, files: { 'src/x.ts': 'export const x = 1\n' } })
	git({ root: worktree, args: ['add', 'src/x.ts'] })
	git({ root: worktree, args: ['commit', '-qm', 'feat(x): x answers one'] })
	return { root, origin, worktree, lotFolder: temporaryFolder('dialecte-land-lot-') }
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

/** A host that answers from memory and records each call. */
export function recordingHost(params: { existing?: PullRequest } = {}): RecordingHost {
	const calls: string[] = []
	let pullRequest = params.existing
	const host: HostAdapter = {
		readPullRequest: function readPullRequest(call) {
			calls.push(`read ${call.ref}`)
			return pullRequest
		},
		openPullRequest: function openPullRequest(call) {
			calls.push(`open ${call.branch} -> ${call.base} "${call.title}"${call.draft ? ' draft' : ''}`)
			pullRequest = {
				number: 7,
				url: 'https://host.test/pull/7',
				state: 'open',
				draft: call.draft,
				queued: false,
				head: '',
			}
			return pullRequest
		},
		closePullRequest: function closePullRequest(call) {
			calls.push(`close ${call.number}`)
			return undefined
		},
		queuePullRequest: function queuePullRequest(call) {
			calls.push(`queue ${call.number}`)
			return undefined
		},
	}
	return { host, calls }
}
