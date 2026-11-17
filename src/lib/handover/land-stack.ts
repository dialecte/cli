/**
 * The stack step of a landing (33CI CI4). A lot started on another (`stack.json`) lands on its parent: its pull request
 * is based on the parent's branch (and linked to the parent's as a native stack when the host has stacks), rebased
 * onto the parent's tip when the parent's branch moved. Once the parent merged, the lot drops the parent's commits:
 * based on the parent's branch, the cli rebases it off them onto origin's base; as a native stack, the host already
 * rebased origin's branch and the lot follows it (never forcing its own rebase over the host's). A conflict stops the
 * landing, the rebase undone: never a silent resolution.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'

import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { isAncestorCommit, readGit, tryReadGit } from '../git.ts'
import { readIdentity } from '../store/identity.ts'
import { readStack, writeStack } from '../store/stack.ts'
import { UNTRACKED_STATUS_PREFIX } from './land-lot.constants.ts'
import { readLanding } from './land-record.ts'
import { STACK_CONFLICT_EXIT, STACK_LANDING_LINES } from './land-stack.constants.ts'

import type { HostAdapter, PullRequest } from '../host/host.types.ts'
import type { StackRecord, StackRoute } from '../store/stack.types.ts'
import type { LandingRecord } from './land-lot.types.ts'
import type { StackLanding, StackRefusal } from './land-stack.types.ts'

/**
 * How the stacked lot in `lotFolder` lands now, its rebase done; undefined for a lot that is not stacked; the refusal
 * of a parent whose records or pull request are missing, of a queue that must wait for the parent, or of a rebase that
 * conflicts (exit 2). `landing` is the lot's own landing record (the head its last landing pushed).
 *
 * @intent land a lot started on another open lot as a stack
 * @internal
 */
export function prepareStackLanding(params: {
	lot: string
	worktree: string
	branch: string
	base: string
	lotFolder: string
	host: HostAdapter
	draft: boolean
	landing: LandingRecord | undefined
}): StackLanding | StackRefusal | undefined {
	const record = readStack({ lotFolder: params.lotFolder })
	if (record === undefined) return undefined
	const parent = readParent({ ...params, record })
	if ('refusal' in parent) return parent
	const routed = routeOf({
		...params,
		record,
		parentPull: parent.pullRequest,
		parentBranch: parent.branch,
	})
	const lines = routed.line === undefined ? [] : [routed.line]
	const state = { ...record, route: routed.route }
	if (parent.pullRequest.state === 'merged')
		return offMergedParent({ ...params, record: state, parentPull: parent.pullRequest, lines })
	if (!params.draft && routed.route === 'branch')
		return {
			exitCode: 1,
			refusal: STACK_LANDING_LINES.waits
				.replace('{lot}', () => params.lot)
				.replace('{number}', String(parent.pullRequest.number))
				.replace('{parent}', () => record.parent),
		}
	const restacked = onParentTip({ ...params, record: state, parentBranch: parent.branch })
	if ('refusal' in restacked) return restacked
	return {
		pullBase: parent.branch,
		textBase: restacked.parentHead,
		route: routed.route,
		parentMerged: false,
		parentPull: parent.pullRequest,
		lines: [...lines, ...restacked.lines],
	}
}

/**
 * After the pull request is known: a stacked pull request just opened is linked to its parent's (native), and one
 * that merges into another branch than the landing's is retargeted; the lines saying so, or the host's refusal.
 *
 * @intent keep a stacked pull request on the right base
 * @internal
 */
export function settleStackedPull(params: {
	worktree: string
	host: HostAdapter
	stack: StackLanding
	pullRequest: PullRequest
	opened: boolean
}): { lines: string[] } | { refusal: string } {
	const { host, stack, pullRequest, worktree } = params
	const lines: string[] = []
	if (params.opened && stack.route === 'native' && !stack.parentMerged) {
		const linked = host.linkStack({
			root: worktree,
			parent: stack.parentPull.url,
			child: pullRequest.url,
		})
		if (linked !== undefined) return linked
		lines.push(STACK_LANDING_LINES.linked.replace('{number}', String(stack.parentPull.number)))
	}
	if (!params.opened && pullRequest.base !== stack.pullBase) {
		const moved = host.retargetPullRequest({
			root: worktree,
			number: pullRequest.number,
			base: stack.pullBase,
		})
		if (moved !== undefined) return moved
		lines.push(
			STACK_LANDING_LINES.retargeted
				.replace('{number}', String(pullRequest.number))
				.replace('{base}', () => stack.pullBase),
		)
	}
	return { lines }
}

/** The parent lot's branch and pull request (its `landing.json`'s, as the host holds it now), or the refusal. */
function readParent(params: {
	lot: string
	worktree: string
	lotFolder: string
	host: HostAdapter
	record: StackRecord
}): { branch: string; pullRequest: PullRequest } | StackRefusal {
	const { record, lot } = params
	const parentFolder = join(dirname(params.lotFolder), record.parent)
	function fill(template: string): string {
		return template.replaceAll('{lot}', () => lot).replaceAll('{parent}', () => record.parent)
	}
	const identity = readIdentity({ lotFolder: parentFolder })
	if (identity === undefined || typeof identity.branch !== 'string')
		return { exitCode: 1, refusal: fill(STACK_LANDING_LINES.noParent) }
	const landing = readLanding({ lotFolder: parentFolder })
	if (landing === undefined) return { exitCode: 1, refusal: fill(STACK_LANDING_LINES.noParentPull) }
	const read = params.host.readPullRequest({ root: params.worktree, ref: String(landing.number) })
	if (read === undefined) return { exitCode: 1, refusal: fill(STACK_LANDING_LINES.noParentPull) }
	if ('refusal' in read) return { exitCode: 1, refusal: `lot land: ${read.refusal}` }
	return { branch: identity.branch, pullRequest: read }
}

/**
 * The lot's route: the one its first landing recorded, else the host's answer now (recorded at once), with the note of
 * a pull request based on the parent's branch because the host has no stacks here.
 */
function routeOf(params: {
	worktree: string
	lotFolder: string
	host: HostAdapter
	record: StackRecord
	parentPull: PullRequest
	parentBranch: string
}): { route: StackRoute; line?: string } {
	const { record } = params
	if (record.route !== undefined) return { route: record.route }
	const support = params.host.probeStacks({ root: params.worktree })
	const route: StackRoute = support.stacks ? 'native' : 'branch'
	writeStack({ lotFolder: params.lotFolder, record: { ...record, route } })
	if (support.stacks) return { route }
	return {
		route,
		line: STACK_LANDING_LINES.basedOn
			.replace('{number}', String(params.parentPull.number))
			.replace('{branch}', () => params.parentBranch)
			.replace('{why}', () => support.why),
	}
}

/**
 * The lot rebased onto its parent's branch tip when that moved since the lot's `parentHead` (the new tip recorded);
 * the parent head it now sits on, the line saying so; a conflict's refusal.
 */
function onParentTip(params: {
	lot: string
	worktree: string
	lotFolder: string
	record: StackRecord
	parentBranch: string
}): { parentHead: string; lines: string[] } | StackRefusal {
	const { record, worktree } = params
	const tip = tryReadGit({
		root: worktree,
		args: ['rev-parse', '--verify', '--quiet', `refs/heads/${params.parentBranch}^{commit}`],
	})?.trim()
	if (tip === undefined || tip === '' || tip === record.parentHead)
		return { parentHead: record.parentHead, lines: [] }
	const rebased = rebaseOnto({
		lot: params.lot,
		worktree,
		onto: tip,
		upstream: record.parentHead,
		label: params.parentBranch,
	})
	if (rebased !== undefined) return rebased
	writeStack({ lotFolder: params.lotFolder, record: { ...record, parentHead: tip } })
	return {
		parentHead: tip,
		lines: [
			STACK_LANDING_LINES.restacked
				.replace('{parent}', () => params.parentBranch)
				.replace('{commit}', tip.slice(0, SHORT_SHA_LENGTH)),
		],
	}
}

/**
 * The lot off its merged parent: based on the parent's branch, rebased off the parent's commits onto origin's base;
 * native, moved to the host's rewrite of origin's branch (local commits beyond the last push rebased onto it, its head
 * the next push's lease). The parent head recorded is origin's base tip.
 */
function offMergedParent(params: {
	lot: string
	worktree: string
	branch: string
	base: string
	lotFolder: string
	record: StackRecord & { route: StackRoute }
	parentPull: PullRequest
	landing: LandingRecord | undefined
	lines: string[]
}): StackLanding | StackRefusal {
	const { worktree, record, base } = params
	const originBase = `${ORIGIN_BRANCH_REF_PREFIX}${base}`
	const baseTip = readGit({ root: worktree, args: ['rev-parse', originBase] }).trim()
	const moved: { lines: string[]; lease?: string } | StackRefusal =
		record.route === 'native' ? followHost({ ...params }) : offParentCommits({ ...params, baseTip })
	if ('refusal' in moved) return moved
	writeStack({ lotFolder: params.lotFolder, record: { ...record, parentHead: baseTip } })
	return {
		pullBase: base,
		textBase: originBase,
		route: record.route,
		parentMerged: true,
		parentPull: params.parentPull,
		...(moved.lease !== undefined && { lease: moved.lease }),
		lines: [...params.lines, ...moved.lines],
	}
}

/** The fallback route: `git rebase --onto origin/<base> <parentHead>` unless origin's base holds the parent head. */
function offParentCommits(params: {
	lot: string
	worktree: string
	base: string
	record: StackRecord
	parentPull: PullRequest
	baseTip: string
}): { lines: string[] } | StackRefusal {
	const { worktree, record, baseTip } = params
	// a parent merged with its own commits, or a rebase done by an earlier landing: the base's rebase does the rest
	if (isAncestorCommit({ root: worktree, ancestor: record.parentHead, descendant: baseTip }))
		return { lines: [] }
	const rebased = rebaseOnto({
		lot: params.lot,
		worktree,
		onto: baseTip,
		upstream: record.parentHead,
		label: `origin/${params.base}`,
	})
	if (rebased !== undefined) return rebased
	return {
		lines: [
			STACK_LANDING_LINES.offParent
				.replace('{parent}', () => record.parent)
				.replace('{base}', () => params.base)
				.replace('{commit}', baseTip.slice(0, SHORT_SHA_LENGTH))
				.replace('{number}', String(params.parentPull.number)),
		],
	}
}

/**
 * The native route: origin's branch as the host rewrote it once the parent merged. Nothing local beyond the last
 * pushed head: the worktree moves to it (`git reset --keep`, uncommitted changes kept). More: those commits rebased
 * onto it. Its head is the next push's lease. The host not done yet (origin's branch still the pushed head) is refused.
 */
function followHost(params: {
	lot: string
	worktree: string
	branch: string
	base: string
	record: StackRecord
	parentPull: PullRequest
	landing: LandingRecord | undefined
}): { lines: string[]; lease: string } | StackRefusal {
	const { worktree, branch } = params
	const originBranch = `${ORIGIN_BRANCH_REF_PREFIX}${branch}`
	const remote = tryReadGit({
		root: worktree,
		args: ['rev-parse', '--verify', '--quiet', originBranch],
	})?.trim()
	const pushed = params.landing?.branch === branch ? params.landing.head : undefined
	if (remote === undefined || remote === '' || pushed === undefined || remote === pushed)
		return {
			exitCode: 1,
			refusal: STACK_LANDING_LINES.notRewritten
				.replace('{number}', String(params.parentPull.number))
				.replace('{parent}', () => params.record.parent)
				.replace('{branch}', () => branch),
		}
	const head = readGit({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const moved =
		head === pushed
			? resetKeep({ lot: params.lot, worktree, onto: remote, label: originBranch })
			: rebaseOnto({
					lot: params.lot,
					worktree,
					onto: remote,
					upstream: pushed,
					label: originBranch,
				})
	if (moved !== undefined) return moved
	return {
		lease: remote,
		lines: [
			STACK_LANDING_LINES.followed
				.replace('{branch}', () => branch)
				.replace('{base}', () => params.base)
				.replace('{commit}', remote.slice(0, SHORT_SHA_LENGTH)),
		],
	}
}

/** `git reset --keep <onto>`: the worktree moved, uncommitted changes kept; the refusal when git cannot keep them. */
function resetKeep(params: {
	lot: string
	worktree: string
	onto: string
	label: string
}): StackRefusal | undefined {
	const reset = spawnSync('git', ['reset', '--quiet', '--keep', params.onto], {
		cwd: params.worktree,
		encoding: 'utf8',
	})
	if (reset.status === 0) return undefined
	return {
		exitCode: 1,
		refusal: STACK_LANDING_LINES.dirty
			.replace('{lot}', () => params.lot)
			.replace('{onto}', () => params.label),
	}
}

/**
 * `git rebase --onto <onto> <upstream>` of the worktree's branch: undefined once done; with tracked files changed,
 * refused before git runs; a conflict lists its files, the rebase aborted (the worktree as it was), exit 2.
 */
function rebaseOnto(params: {
	lot: string
	worktree: string
	onto: string
	upstream: string
	/** How the lines name `onto`. */
	label: string
}): StackRefusal | undefined {
	const { worktree } = params
	const tracked = readGit({ root: worktree, args: ['status', '--porcelain'] })
		.split('\n')
		.filter((line) => line !== '' && !line.startsWith(UNTRACKED_STATUS_PREFIX))
	if (tracked.length > 0)
		return {
			exitCode: 1,
			refusal: STACK_LANDING_LINES.dirty
				.replace('{lot}', () => params.lot)
				.replace('{onto}', () => params.label),
		}
	const rebase = spawnSync('git', ['rebase', '--quiet', '--onto', params.onto, params.upstream], {
		cwd: worktree,
		encoding: 'utf8',
	})
	if (rebase.status === 0) return undefined
	const files = readGit({ root: worktree, args: ['diff', '--name-only', '--diff-filter=U'] })
		.split('\n')
		.filter(Boolean)
	spawnSync('git', ['rebase', '--abort'], { cwd: worktree })
	return {
		exitCode: STACK_CONFLICT_EXIT,
		refusal: STACK_LANDING_LINES.conflict
			.replace('{lot}', () => params.lot)
			.replace('{onto}', () => params.label)
			.replace('{files}', () => (files.length > 0 ? files.join(', ') : 'the lot')),
	}
}
