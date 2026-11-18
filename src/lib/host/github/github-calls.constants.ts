/** Every `gh` call the GitHub adapter makes, declared once: the argv, the timeout and the flags each may take. */
import {
	GH_STACK,
	QUEUED_QUERY,
	REVIEW_COMMENTS_ENDPOINT,
	REVIEW_COMMENTS_JQ,
} from './github.constants.ts'

import type { HostCallTable } from '../host.types.ts'

export const GITHUB_CALLS = {
	viewPullRequest: {
		words: ['pr', 'view'],
		flags: [],
		kind: 'read',
		fields: [
			'number',
			'url',
			'title',
			'body',
			'state',
			'isDraft',
			'autoMergeRequest',
			'headRefOid',
			'baseRefName',
		],
	},
	viewChecks: {
		words: ['pr', 'view'],
		flags: [],
		kind: 'read',
		fields: ['headRefOid', 'statusCheckRollup'],
	},
	listMergedPullRequests: {
		words: ['pr', 'list'],
		flags: ['--state', '--limit'],
		kind: 'read',
		fields: ['number'],
	},
	createPullRequest: {
		words: ['pr', 'create'],
		flags: ['--base', '--head', '--title', '--body', '--draft'],
		kind: 'write',
	},
	readyPullRequest: { words: ['pr', 'ready'], flags: ['--undo'], kind: 'write' },
	mergePullRequest: { words: ['pr', 'merge'], flags: ['--auto', '--disable-auto'], kind: 'write' },
	editPullRequest: {
		words: ['pr', 'edit'],
		flags: ['--base', '--title', '--body-file'],
		kind: 'write',
	},
	closePullRequest: { words: ['pr', 'close'], flags: [], kind: 'write' },
	reviewComments: {
		words: ['api'],
		flags: ['--paginate'],
		kind: 'read',
		endpoint: REVIEW_COMMENTS_ENDPOINT,
		filter: REVIEW_COMMENTS_JQ,
	},
	queuedState: {
		words: ['api'],
		flags: ['-F'],
		kind: 'read',
		endpoint: 'graphql',
		graphql: QUEUED_QUERY,
		filter: '.data.repository.pullRequest',
	},
	stackHelp: { words: [GH_STACK], flags: ['--help'], kind: 'read' },
	stackLink: { words: [GH_STACK, 'link'], flags: [], kind: 'write' },
	stackMerge: { words: [GH_STACK, 'merge'], flags: ['--yes', '--squash'], kind: 'write' },
} as const satisfies HostCallTable
