/**
 * The stack step of a landing (33CI CI4, FIX-ci-loop section 1). A lot started on another (`stack.json`, the parent
 * only) lands on its parent: its pull request is based on the parent's branch (and linked to the parent's as a native
 * stack when the host has stacks), rebased onto the parent's newest tip when the parent moved. Once the parent merged
 * (its landing state), the lot drops the parent's commits: rebased `--onto` origin's base from its fork point, the
 * newest commit of the parent's line it holds (`lotBaseOf`, reflog-aware: an amended, rebased or squashed parent
 * moves only the lot's own commits); when the host already rewrote origin's branch (a native stack), the lot follows
 * it (never forcing its own rebase over the host's). A conflict stops the landing, the rebase undone: never a silent
 * resolution.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'

import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { isAncestorCommit, readCommitOrNone, readGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { lotBaseOf } from '../landing/lot-base.ts'
import { readLotLanding, recordLanded } from '../landing/lot-landing.ts'
import { readStack } from '../store/stack.ts'
import { UNTRACKED_STATUS_PREFIX } from './land-lot.constants.ts'
import { readLanding } from './land-record.ts'
import { STACK_CONFLICT_EXIT, STACK_LANDING_LINES } from './land-stack.constants.ts'

import type { HostAdapter, ChangeRequest } from '../host/host.types.ts'
import type { LandingState } from '../landing/landing-state.types.ts'
import type { LotBase } from '../landing/lot-base.types.ts'
import type { LotLanding } from '../landing/lot-landing.types.ts'
import type { StackRecord } from '../store/stack.types.ts'
import type { LandingRecord } from './land-lot.types.ts'
import type { StackLanding, StackRefusal } from './land-stack.types.ts'

/**
 * How the stacked lot in `lotFolder` lands now, its rebase done; undefined for a lot that is not stacked; the refusal
 * of a parent whose records or pull request are missing, or of a rebase that conflicts (exit 2). `landing` is the lot's own landing record (the head its last landing pushed).
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
	landing: LandingRecord | undefined
	/** When the landing runs: the time of the parent's landed fact it records. */
	now: Date
}): StackLanding | StackRefusal | undefined {
	const record = readStack({ lotFolder: params.lotFolder })
	if (record === undefined) return undefined
	if ('damage' in record)
		return {
			exitCode: 1,
			refusal: fillMessage({
				template: STACK_LANDING_LINES.damaged,
				values: { lot: params.lot, damage: record.damage },
			}),
		}
	const parent = readParent({ ...params, record })
	if ('refusal' in parent) return parent
	const originBase = `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`
	const base = lotBaseOf({
		root: params.worktree,
		head: 'HEAD',
		baseRef: originBase,
		parent: { branch: parent.branch, landing: parent.landing },
	})
	if ('refusal' in base) return { exitCode: 1, refusal: `lot land: ${base.refusal}` }
	if (parent.landing.kind === 'merged')
		return offMergedParent({
			...params,
			record,
			lotBase: base,
			parentChangeRequest: parent.changeRequest,
		})
	// the parent is open: its pull request is what the child's stacks on
	const parentChangeRequest = parent.changeRequest
	if (parentChangeRequest === undefined)
		return {
			exitCode: 1,
			refusal: fillMessage({
				template: STACK_LANDING_LINES.noParentChangeRequest,
				values: { lot: params.lot, parent: record.parent },
			}),
		}
	const support = params.host.probeStacks({ root: params.worktree })
	const restacked = onParentTip({ ...params, base, parentBranch: parent.branch })
	if ('refusal' in restacked) return restacked
	const note = support.stacks
		? []
		: [
				fillMessage({
					template: STACK_LANDING_LINES.basedOn,
					values: {
						number: String(parentChangeRequest.number),
						branch: parent.branch,
						why: support.why,
					},
				}),
			]
	return {
		changeRequestBase: parent.branch,
		textBase: base.ref,
		route: support.stacks ? 'native' : 'branch',
		// a pull request a landing opened on a host with stacks was linked then: the landing refuses otherwise
		linked: support.stacks && params.landing?.branch === params.branch,
		parentMerged: false,
		parentChangeRequest,
		lines: [...note, ...restacked.lines],
	}
}

/**
 * After the pull request is known: a stacked pull request just opened on a host with stacks is linked on its parent's
 * (the parent open), and one that merges into another branch than the landing's is retargeted; the lines saying so, or
 * the host's refusal.
 *
 * @intent keep a stacked pull request on the right base
 * @internal
 */
export function settleStackedChangeRequest(params: {
	worktree: string
	host: HostAdapter
	stack: StackLanding
	changeRequest: ChangeRequest
	opened: boolean
}): { lines: string[] } | { refusal: string } {
	const { host, stack, changeRequest, worktree } = params
	const lines: string[] = []
	const parentChangeRequest = stack.parentChangeRequest
	if (
		stack.route === 'native' &&
		!stack.linked &&
		!stack.parentMerged &&
		parentChangeRequest !== undefined
	) {
		const linked = host.linkStack({
			root: worktree,
			parent: parentChangeRequest.url,
			child: changeRequest.url,
		})
		if (linked !== undefined) return linked
		lines.push(
			fillMessage({
				template: STACK_LANDING_LINES.linked,
				values: { number: String(parentChangeRequest.number) },
			}),
		)
	}
	if (!params.opened && changeRequest.base !== stack.changeRequestBase) {
		const moved = host.retargetChangeRequest({
			root: worktree,
			number: changeRequest.number,
			base: stack.changeRequestBase,
		})
		if (moved !== undefined) return moved
		lines.push(
			fillMessage({
				template: STACK_LANDING_LINES.retargeted,
				values: { number: String(changeRequest.number), base: stack.changeRequestBase },
			}),
		)
	}
	return { lines }
}

/**
 * The parent lot's branch, its landing state (its landed fact, else git and the host) and its pull request (the one its
 * landing state names, else its `landing.json`'s as the host holds it), or the refusal.
 */
function readParent(params: {
	lot: string
	worktree: string
	lotFolder: string
	host: HostAdapter
	record: StackRecord
	now: Date
}): { branch: string; landing: LandingState; changeRequest?: ChangeRequest } | StackRefusal {
	const { record, lot } = params
	const parentFolder = join(dirname(params.lotFolder), record.parent)
	const read = readLotLanding({ lotFolder: parentFolder, root: params.worktree, host: params.host })
	if ('refusal' in read)
		return {
			exitCode: 1,
			refusal: fillMessage({
				template: STACK_LANDING_LINES.noParent,
				values: { lot, parent: record.parent },
			}),
		}
	const { state } = read
	// a landing acts: a parent proven merged (git or the host) gets its landed fact, as lot close records it
	const recorded = recordedParentOf({ lot, parent: record.parent, landing: read, now: params.now })
	if (recorded !== undefined) return recorded
	if (state.kind === 'unlanded' && state.hostRefusal !== undefined)
		return { exitCode: 1, refusal: `lot land: ${state.hostRefusal}` }
	const branch = read.identity.branch
	const changeRequest = 'changeRequest' in state ? state.changeRequest : undefined
	if (changeRequest !== undefined) return { branch, landing: state, changeRequest: changeRequest }
	const number = readLanding({ lotFolder: parentFolder })?.number
	const asked =
		number === undefined
			? undefined
			: params.host.readChangeRequest({ root: params.worktree, ref: String(number) })
	if (asked !== undefined && 'refusal' in asked)
		return { exitCode: 1, refusal: `lot land: ${asked.refusal}` }
	return { branch, landing: state, ...(asked !== undefined && { changeRequest: asked }) }
}

/** The parent's landed fact written when its landing is proven merged; the refusal when it cannot be written. */
function recordedParentOf(params: {
	lot: string
	parent: string
	landing: LotLanding
	now: Date
}): StackRefusal | undefined {
	try {
		recordLanded({ landing: params.landing, now: params.now })
		return undefined
	} catch (error) {
		return {
			exitCode: 1,
			refusal: fillMessage({
				template: STACK_LANDING_LINES.parentNotRecorded,
				values: {
					lot: params.lot,
					parent: params.parent,
					reason: (error as Error).message.trim(),
				},
			}),
		}
	}
}

/**
 * The lot rebased onto its parent's newest branch tip when it does not hold it: from its fork point, so only its own
 * commits move; the lines saying so, a conflict's refusal.
 */
function onParentTip(params: {
	lot: string
	worktree: string
	base: LotBase
	parentBranch: string
}): { lines: string[] } | StackRefusal {
	const { worktree, base } = params
	const tip = readCommitOrNone({ root: worktree, ref: base.ref })
	if (tip === undefined || isAncestorCommit({ root: worktree, ancestor: tip, descendant: 'HEAD' }))
		return { lines: [] }
	const rebased = rebaseOnto({
		lot: params.lot,
		worktree,
		onto: tip,
		upstream: base.forkPoint,
		label: params.parentBranch,
	})
	if (rebased !== undefined) return rebased
	return {
		lines: [
			fillMessage({
				template: STACK_LANDING_LINES.restacked,
				values: { parent: params.parentBranch, commit: tip.slice(0, SHORT_SHA_LENGTH) },
			}),
		],
	}
}

/**
 * The lot off its merged parent: when the host already rewrote origin's branch (a native stack's top once its bottom
 * merged: origin's branch is no longer the head the lot's last landing pushed), the lot follows that rewrite; else it
 * is rebased `--onto` origin's base from its fork point, unless origin's base holds the fork point already (the base's
 * own rebase does the rest).
 */
function offMergedParent(params: {
	lot: string
	worktree: string
	branch: string
	base: string
	record: StackRecord
	lotBase: LotBase
	parentChangeRequest: ChangeRequest | undefined
	landing: LandingRecord | undefined
}): StackLanding | StackRefusal {
	const originBase = `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`
	const rewritten = hostRewriteOf(params)
	const moved: { lines: string[]; lease?: string } | StackRefusal =
		rewritten === undefined
			? offParentCommits({ ...params, originBase })
			: followHost({ ...params, remote: rewritten.remote, pushed: rewritten.pushed })
	if ('refusal' in moved) return moved
	return {
		changeRequestBase: params.base,
		textBase: originBase,
		route: rewritten === undefined ? 'branch' : 'native',
		linked: rewritten !== undefined,
		parentMerged: true,
		parentChangeRequest: params.parentChangeRequest,
		...(moved.lease !== undefined && { lease: moved.lease }),
		lines: moved.lines,
	}
}
/**
 * Origin's branch as the host rewrote it once the parent merged: it is not the head the lot's last landing pushed,
 * and that head is known (a lot that never pushed was never rewritten); undefined otherwise.
 */
function hostRewriteOf(params: {
	worktree: string
	branch: string
	landing: LandingRecord | undefined
}): { remote: string; pushed: string } | undefined {
	const remote = readCommitOrNone({
		root: params.worktree,
		ref: `${ORIGIN_BRANCH_REF_PREFIX}${params.branch}`,
	})
	const pushed = params.landing?.branch === params.branch ? params.landing.head : undefined
	if (remote === undefined || pushed === undefined || remote === pushed) return undefined
	return { remote, pushed }
}

/**
 * The lot rebased `--onto` origin's base from its fork point, unless origin's base holds the fork point (a parent
 * merged with its own commits, or a lot already moved: the base's own rebase does the rest).
 */
function offParentCommits(params: {
	lot: string
	worktree: string
	base: string
	originBase: string
	record: StackRecord
	lotBase: LotBase
	parentChangeRequest: ChangeRequest | undefined
}): { lines: string[] } | StackRefusal {
	const { worktree, lotBase } = params
	const baseTip = readGit({ root: worktree, args: ['rev-parse', params.originBase] }).trim()
	if (isAncestorCommit({ root: worktree, ancestor: lotBase.forkPoint, descendant: baseTip }))
		return { lines: [] }
	const rebased = rebaseOnto({
		lot: params.lot,
		worktree,
		onto: baseTip,
		upstream: lotBase.forkPoint,
		label: `origin/${params.base}`,
	})
	if (rebased !== undefined) return rebased
	return {
		lines: [
			fillMessage({
				template: STACK_LANDING_LINES.offParent,
				values: {
					parent: params.record.parent,
					base: params.base,
					commit: baseTip.slice(0, SHORT_SHA_LENGTH),
					merged:
						params.parentChangeRequest === undefined
							? params.record.parent
							: `#${params.parentChangeRequest.number}`,
				},
			}),
		],
	}
}

/**
 * The host's rewrite followed: nothing local beyond the last pushed head, the worktree moves to it (`git reset --keep`,
 * uncommitted changes kept); more, those commits rebased onto it. Its head is the next push's lease.
 */
function followHost(params: {
	lot: string
	worktree: string
	branch: string
	base: string
	remote: string
	pushed: string
}): { lines: string[]; lease: string } | StackRefusal {
	const { worktree, remote, pushed } = params
	const originBranch = `${ORIGIN_BRANCH_REF_PREFIX}${params.branch}`
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
			fillMessage({
				template: STACK_LANDING_LINES.followed,
				values: {
					branch: params.branch,
					base: params.base,
					commit: remote.slice(0, SHORT_SHA_LENGTH),
				},
			}),
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
		refusal: fillMessage({
			template: STACK_LANDING_LINES.dirty,
			values: { lot: params.lot, onto: params.label },
		}),
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
			refusal: fillMessage({
				template: STACK_LANDING_LINES.dirty,
				values: { lot: params.lot, onto: params.label },
			}),
		}
	const rebase = spawnSync('git', ['rebase', '--quiet', '--onto', params.onto, params.upstream], {
		cwd: worktree,
		encoding: 'utf8',
	})
	if (rebase.status === 0) return undefined
	const files = readGit({ root: worktree, args: ['diff', '--name-only', '--diff-filter=U'] })
		.split('\n')
		.filter(Boolean)
	const abort = spawnSync('git', ['rebase', '--abort'], { cwd: worktree, encoding: 'utf8' })
	const values = {
		lot: params.lot,
		onto: params.label,
		files: files.length > 0 ? files.join(', ') : 'the lot',
	}
	if (abort.status !== 0)
		return {
			exitCode: STACK_CONFLICT_EXIT,
			refusal: fillMessage({
				template: STACK_LANDING_LINES.notUndone,
				values: {
					...values,
					reason: abort.stderr.trim().split('\n')[0] || `exit ${abort.status}`,
				},
			}),
		}
	return {
		exitCode: STACK_CONFLICT_EXIT,
		refusal: fillMessage({ template: STACK_LANDING_LINES.conflict, values }),
	}
}
