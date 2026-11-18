/**
 * A lot lands through its pull request (33CI CI3). The worktree is on the lot's branch; origin is fetched (a failure
 * stops the landing). A push carries only commits: the committed head lands, work in progress stays where it is and is
 * named (with a tracked file changed, git cannot rebase: the lot is pushed as committed, the line saying so). A lot
 * already merged (its pull request merged, or its tip or its work in the base: the landing state) is committed: its
 * landed fact written, nothing pushed, the close line printed. Otherwise the lot is rebased onto origin's base branch when behind (a conflict undone and named), pushed
 * with a lease pinned to the head its last landing pushed (a branch it never pushed must not exist on origin), its open
 * pull request reused or a new one opened (its title and body rendered from the lot's records, `lot pr`'s template; a reused one edited when it
 * reads otherwise), always a draft and never queued (`lot approve`, a person's step, queues it; a push that moves a
 * reused pull request's head takes it back out of the queue as a draft) - and the landing recorded: `landing.json` in the lot's folder, and
 * the lot's hand-over entry (state pending; committed once its pull request merged) that `lot status`, `plan next` and
 * `lot close` read.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { recordForecastRun } from '../coordination/forecast-record.ts'
import { forecastConflictsText, forecastHoldText } from '../coordination/forecast-view.ts'
import { AGAINST_MAIN, FORECAST_STEP_LIMIT_MS } from '../coordination/forecast.constants.ts'
import { forecastLot } from '../coordination/forecast.ts'
import { mergeConflictsOf } from '../coordination/merge-forecast.ts'
import { counted } from '../counted.ts'
import { recordBaseDeclared } from '../design/base-declared.ts'
import { designGateOf } from '../design/design-gate.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { fetchOrigin, isAncestorCommit, readGit, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { LANDED_SCHEMA } from '../landing/landed-record.constants.ts'
import { writeLanded } from '../landing/landed-record.ts'
import { readLandingState } from '../landing/landing-state.ts'
import { workSinceLanding, workSinceLandingText } from '../landing/lost-work.ts'
import { landedLineOf } from '../landing/lot-landing.ts'
import { readPackageJson } from '../package-json.ts'
import { composePullRequest, keptPartOf, linesOf } from '../pr/compose-pull-request.ts'
import { preparePullRequest } from '../pr/pull-request-sources.ts'
import { readIdentity } from '../store/identity.ts'
import { replaceWhole } from '../store/publish.ts'
import { STORE_REFUSAL } from '../store/store.constants.ts'
import { resolveTddBase } from '../tdd/tdd-base.ts'
import { registeredEntryOf } from './handover-store-read.ts'
import { findHandoverStore, recordHandoverState, registerHandover } from './handover-store.ts'
import { HANDOVER_LOT_REFUSALS } from './handover.constants.ts'
import {
	LANDING_FILE,
	LANDING_LINES,
	LANDING_SCHEMA,
	PUSH_REJECTED_PATTERN,
	PUSHED_OUTSIDE_PATTERN,
	OVERWRITE_PATTERN,
	UNTRACKED_STATUS_PREFIX,
} from './land-lot.constants.ts'
import { NOTHING_BEYOND_BASE_LINE } from './land-push.constants.ts'
import { readLanding, readRawLanding } from './land-record.ts'
import { prepareStackLanding, settleStackedPull } from './land-stack.ts'

import type { HostAdapter, PullRequest } from '../host/host.types.ts'
import type { LandedFact } from '../landing/landed-record.types.ts'
import type { PullRequestText } from '../pr/pull-request.types.ts'
import type { LandingRecord, LandingResult } from './land-lot.types.ts'
import type { StackLanding } from './land-stack.types.ts'

/**
 * Lands the lot on `branch` checked out in `worktree` into `base` through `host` as a draft, never queued (CI runs on
 * every push while the lot goes on; `lot approve` queues it). Never throws for a refusal: its line, exit 1.
 *
 * @intent land a lot through its pull request and the merge queue
 * @internal
 */
export function landLot(params: {
	/** The lot's name, as its pull request body and the next line name it. */
	lot: string
	worktree: string
	branch: string
	base: string
	lotFolder: string
	host: HostAdapter
	now: Date
}): LandingResult {
	const { worktree, branch, base, host } = params
	const unready = unreadyRefusal({ worktree, branch, base, lotFolder: params.lotFolder })
	if (unready !== undefined) return refused(unready)
	const landing = readLanding({ lotFolder: params.lotFolder })
	const known = readKnownPullRequest({ worktree, branch, landing, host })
	if ('refusal' in known)
		return refused(LANDING_LINES.hostRefused.replace('{reason}', () => known.refusal))
	// a lot already merged is committed: its pull request merged, or its tip or work in the base (git alone)
	const merged = mergedFactOf({ ...params, pullRequest: known.pullRequest })
	if (merged !== undefined) return landedLot({ ...params, fact: merged })
	// read, never written, before any refusal: a lot committed by a local hand-over gets the registry's committed answer
	const committed = committedEntryRefusal({ worktree, lotFolder: params.lotFolder })
	if (committed !== undefined) return refused(committed)
	// a lot started on another lands on it (33CI CI4): rebased onto its parent, or off it once the parent merged
	const stack = prepareStackLanding({ ...params, landing })
	if (stack !== undefined && 'refusal' in stack)
		return { exitCode: stack.exitCode, lines: [stack.refusal] }
	// a branch the base already holds has nothing to land: refused before any entry, push or pull request
	const empty = nothingBeyondBase({ worktree, branch, base })
	if (empty !== undefined) return refused(empty)
	const forecast = landingForecast({
		...params,
		onOpenParent: stack !== undefined && !stack.parentMerged,
	})
	if ('refusal' in forecast) return refused(forecast.refusal)
	const registered = registerLotEntry({ ...params })
	if ('refusal' in registered) return refused(registered.refusal)
	const { entry } = registered
	const lines: string[] = [...(stack?.lines ?? []), ...forecast.lines]
	const progress = readWorkInProgress({ worktree })
	// a lot on an open parent carries the parent's commits: never rebased onto the base before the parent merged
	const rebased =
		stack !== undefined && !stack.parentMerged
			? {}
			: rebaseOnOrigin({ worktree, base, trackedChanges: progress.tracked })
	if ('refusal' in rebased) return refused(rebased.refusal)
	if (rebased.line) lines.push(rebased.line)
	// a store lot, on the base it now sits on: the base's shared areas recorded again, then its design held (DG2)
	const baseRef = stack?.textBase ?? `${ORIGIN_BRANCH_REF_PREFIX}${base}`
	const designRefusal = landingDesignRefusalOf({ lotFolder: params.lotFolder, worktree, baseRef })
	if (designRefusal !== undefined) return { exitCode: 1, lines: [...lines, designRefusal] }
	if (progress.files > 0)
		lines.push(
			LANDING_LINES.workInProgress.replace('{files}', () =>
				counted({ count: progress.files, noun: 'file' }),
			),
		)
	// rendered on the rebased head, before the push: a text that no longer renders pushes nothing
	const text = renderedText({
		...params,
		baseRef,
		kept: known.pullRequest?.body,
	})
	if ('refusal' in text)
		return {
			exitCode: 1,
			lines: [...lines, LANDING_LINES.unrendered.replace('{reason}', () => text.refusal)],
		}
	const head = readGit({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	// the host rewrote origin's branch (a native stack whose parent merged): that head is the lease
	if (stack?.lease !== undefined)
		recordPushedHead({ lotFolder: params.lotFolder, branch, head: stack.lease })
	const expected = leaseOf({ worktree, branch, base, lotFolder: params.lotFolder })
	const pushProblem = pushLot({ worktree, branch, expected })
	if (pushProblem !== undefined)
		return {
			exitCode: 1,
			lines: [
				...lines,
				expected === '' && PUSHED_OUTSIDE_PATTERN.test(pushProblem)
					? LANDING_LINES.pushedOutside.replace('{branch}', () => branch)
					: LANDING_LINES.pushRefused
							.replace('{branch}', () => branch)
							.replace('{reason}', () => pushProblem),
			],
		}
	// kept at once: a host that refuses to open the pull request must not make the next landing's push "outside"
	recordPushedHead({ lotFolder: params.lotFolder, branch, head })
	lines.push(
		LANDING_LINES.pushed
			.replace('{branch}', () => branch)
			.replace('{commit}', head.slice(0, SHORT_SHA_LENGTH)),
	)
	return publishLanding({ ...params, known: known.pullRequest, text, head, entry, lines, stack })
}

/**
 * The forecast of a landing (33CO 4.2): the committed head against the base just fetched, before any entry, rebase or
 * push (a lot on an open parent is not rebased onto the base, so not compared with it), then the pairs with the other
 * open lots, recorded and printed for information.
 */
function landingForecast(params: {
	worktree: string
	base: string
	lotFolder: string
	now: Date
	onOpenParent: boolean
}): { lines: string[] } | { refusal: string } {
	const refusal = params.onOpenParent ? undefined : baseConflictRefusal(params)
	if (refusal !== undefined) return { refusal }
	return { lines: landPairLines(params) }
}

/**
 * Why the lot's committed head cannot land on `origin/<base>`: their merge conflicts (files and ranges) or cannot be
 * forecast (fails closed); undefined when it merges clean. Writes no worktree, index or ref.
 */
function baseConflictRefusal(params: { worktree: string; base: string }): string | undefined {
	const { worktree, base } = params
	const originTip = tryReadGit({
		root: worktree,
		args: ['rev-parse', '--verify', '--quiet', `${ORIGIN_BRANCH_REF_PREFIX}${base}^{commit}`],
	})?.trim()
	const head = tryReadGit({ root: worktree, args: ['rev-parse', '--verify', 'HEAD'] })?.trim()
	if (!originTip || !head)
		return fillMessage({
			template: LANDING_LINES.forecastUnknown,
			values: { base, reason: `${ORIGIN_BRANCH_REF_PREFIX}${base} or HEAD does not resolve` },
		})
	const merged = mergeConflictsOf({
		root: worktree,
		ours: originTip,
		theirs: head,
		lot: base,
		limitMs: FORECAST_STEP_LIMIT_MS,
	})
	if ('reason' in merged)
		return fillMessage({
			template: LANDING_LINES.forecastUnknown,
			values: { base, reason: merged.reason },
		})
	if (merged.conflicts.length === 0) return undefined
	return fillMessage({
		template: LANDING_LINES.baseConflict,
		values: { base, conflicts: forecastConflictsText({ conflicts: merged.conflicts }) },
	})
}

/**
 * The lot's forecast against every other open lot (trigger `land`), recorded, and one line per pair it does not clear,
 * for information only: the first to land wins, the other lot's next forecast shows it against main.
 */
function landPairLines(params: { lotFolder: string; now: Date }): string[] {
	const { now } = params
	const run = forecastLot({ lotFolder: params.lotFolder, trigger: 'land', now: () => now })
	if ('refusal' in run) return []
	const recorded = recordForecastRun({ lotFolder: params.lotFolder, run, trigger: 'land' })
	const held = run.lines.flatMap((line) => {
		const hold = line.against === AGAINST_MAIN ? undefined : forecastHoldText(line)
		return hold === undefined
			? []
			: [fillMessage({ template: LANDING_LINES.pairHeld, values: { lot: line.against, hold } })]
	})
	return [...held, ...recorded.notes]
}

/** Why origin cannot be landed on: its fetch failed, or it holds no base branch; undefined once fetched. */
function fetchRefusal(params: { worktree: string; base: string }): string | undefined {
	const fetchProblem = fetchOrigin({ root: params.worktree })
	if (fetchProblem !== undefined)
		return LANDING_LINES.fetchFailed.replace('{reason}', () => fetchProblem)
	const baseRef = tryReadGit({
		root: params.worktree,
		args: ['rev-parse', '--verify', '--quiet', `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`],
	})
	return baseRef === undefined
		? LANDING_LINES.noBase.replace('{base}', () => params.base)
		: undefined
}

/**
 * Why the lot cannot land yet, before anything is asked of the host or pushed: its worktree is not on its branch,
 * origin cannot be fetched or holds no base branch, or its records do not render a public pull request text
 * (`preparePullRequest`, the template of its head or of the base).
 */
function unreadyRefusal(params: {
	worktree: string
	branch: string
	base: string
	lotFolder: string
}): string | undefined {
	const { worktree, branch } = params
	const current = tryReadGit({ root: worktree, args: ['symbolic-ref', '--quiet', 'HEAD'] })?.trim()
	if (current !== `refs/heads/${branch}`)
		return LANDING_LINES.notOnBranch
			.replace('{worktree}', () => worktree)
			.replace('{branch}', () => branch)
			.replace('{head}', () => current ?? 'detached')
	const fetched = fetchRefusal({ worktree, base: params.base })
	if (fetched !== undefined) return fetched
	// the lot's head, else the base's: a lot cut before the template changed takes it at its rebase, checked then
	const baseRef = `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`
	const checked = preparePullRequest({
		lotFolder: params.lotFolder,
		worktree,
		baseRef,
		templateRefs: ['HEAD', baseRef],
	})
	return 'refusal' in checked
		? LANDING_LINES.unrendered.replace('{reason}', () => checked.refusal)
		: undefined
}

/**
 * After the push: the lot's pull request, its text rendered on the pushed head (`lot pr`'s template), reused or opened
 * with it, the landing recorded at once (the next push's lease needs its head, whatever the host
 * answers next), a reused one edited when its title or body reads otherwise, then taken back out of the queue as a
 * draft when the push moved its head (an approval is for one head); never queued. `lines` holds
 * what the landing said so far.
 */
function publishLanding(params: {
	lot: string
	worktree: string
	branch: string
	base: string
	lotFolder: string
	host: HostAdapter
	now: Date
	known: PullRequest | undefined
	/** The lot's text, rendered on the head just pushed. */
	text: PullRequestText
	head: string
	entry: string
	lines: string[]
	/** The stack step's answer: the base the pull request merges into, how it queues. */
	stack: StackLanding | undefined
}): LandingResult {
	const { worktree, branch, host, known, text, stack } = params
	const lines = [...params.lines]
	const pull = known ?? openLot({ ...params, base: stack?.pullBase ?? params.base, text })
	if ('refusal' in pull)
		return {
			exitCode: 1,
			lines: [...lines, LANDING_LINES.hostRefused.replace('{reason}', () => pull.refusal)],
		}
	lines.push(
		(known ? LANDING_LINES.existing : LANDING_LINES.opened)
			.replace('{number}', String(pull.number))
			.replace('{url}', () => pull.url),
	)
	writeLanding({
		lotFolder: params.lotFolder,
		pullRequest: pull,
		branch,
		head: params.head,
		now: params.now,
	})
	const edited = editLot({ worktree, host, pullRequest: pull, text })
	if ('refusal' in edited)
		return {
			exitCode: 1,
			lines: [...lines, LANDING_LINES.hostRefused.replace('{reason}', () => edited.refusal)],
		}
	if (edited.line !== undefined) lines.push(edited.line)
	if (stack !== undefined) {
		const settled = settleStackedPull({
			worktree,
			host,
			stack,
			pullRequest: pull,
			opened: known === undefined,
		})
		if ('refusal' in settled)
			return {
				exitCode: 1,
				lines: [...lines, LANDING_LINES.hostRefused.replace('{reason}', () => settled.refusal)],
			}
		lines.push(...settled.lines)
	}
	// an approval is for one head: a reused pull request the push moved goes back out of the queue, as a draft
	if (known !== undefined && known.head !== params.head) {
		const drafted = host.draftPullRequest({
			root: worktree,
			number: pull.number,
			queued: known.queued,
			draft: known.draft,
		})
		if (drafted !== undefined)
			return {
				exitCode: 1,
				lines: [...lines, LANDING_LINES.hostRefused.replace('{reason}', () => drafted.refusal)],
			}
		if (known.queued || !known.draft)
			lines.push(LANDING_LINES.drafted.replace('{number}', String(pull.number)))
	}
	lines.push(
		LANDING_LINES.closeWhenMerged
			.replace('{entry}', () => params.entry)
			.replace('{lot}', () => params.lot),
		LANDING_LINES.draft.replace('{lot}', () => params.lot),
	)
	return { exitCode: 0, lines }
}

/**
 * The registry's committed answer for the lot's folder, read without writing (`registerHandover` refuses a committed
 * entry the same way, after a write would be decided); undefined when the folder has no committed entry.
 */
function committedEntryRefusal(params: {
	worktree: string
	lotFolder: string
}): string | undefined {
	const store = findHandoverStore(params.worktree)
	const registered =
		store === undefined ? undefined : registeredEntryOf({ store, folder: params.lotFolder })
	if (registered?.state !== 'committed') return undefined
	return LANDING_LINES.registryRefused.replace('{reason}', () =>
		HANDOVER_LOT_REFUSALS.committed.replace('{entry}', () => registered.name),
	)
}

/** The lot's hand-over entry registered (its name), or the store's refusal as the landing's line. */
function registerLotEntry(params: {
	worktree: string
	lotFolder: string
	branch: string
	now: Date
}): { entry: string } | { refusal: string } {
	try {
		return {
			entry: registerHandover({
				root: params.worktree,
				folder: params.lotFolder,
				branch: params.branch,
				now: params.now,
			}),
		}
	} catch (error) {
		if ((error as Error).name !== STORE_REFUSAL) throw error
		return {
			refusal: LANDING_LINES.registryRefused.replace('{reason}', () => (error as Error).message),
		}
	}
}

/**
 * The pull request the lot lands through, as the host holds it now: the one its landing recorded (by number), else
 * the branch's open one; a closed one is none (a new one is opened).
 */
function readKnownPullRequest(params: {
	worktree: string
	branch: string
	landing: LandingRecord | undefined
	host: HostAdapter
}): { pullRequest: PullRequest | undefined } | { refusal: string } {
	const ref =
		params.landing?.branch === params.branch ? String(params.landing.number) : params.branch
	const read = params.host.readPullRequest({ root: params.worktree, ref })
	if (read !== undefined && 'refusal' in read) return read
	if (read === undefined || read.state === 'closed') return { pullRequest: undefined }
	// a merged pull request of the branch name that this lot never recorded is another lot's: a new one is opened
	if (read.state === 'merged' && ref === params.branch) return { pullRequest: undefined }
	return { pullRequest: read }
}

/**
 * The landed fact of a lot already merged: its pull request merged (the host's), else its tip or its work in origin's
 * base (git alone); undefined while it is not merged.
 */
function mergedFactOf(params: {
	worktree: string
	branch: string
	base: string
	lotFolder: string
	pullRequest: PullRequest | undefined
	now: Date
}): LandedFact | undefined {
	const { worktree, pullRequest } = params
	const at = params.now.toISOString()
	if (pullRequest?.state === 'merged')
		return {
			schema: LANDED_SCHEMA,
			how: 'host',
			tip: pullRequest.head,
			base: params.base,
			pull: { number: pullRequest.number, url: pullRequest.url },
			at,
		}
	const baseRef = `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`
	const cut = cutOf({ worktree, lotFolder: params.lotFolder, baseRef })
	const state = readLandingState({ root: worktree, branch: params.branch, baseRef, cut })
	if (state.kind !== 'merged') return undefined
	return { schema: LANDED_SCHEMA, how: state.how, tip: state.tip, base: params.base, at }
}

/** The commit the lot was cut from: its identity's, else where its HEAD forks from the base ref. */
function cutOf(params: { worktree: string; lotFolder: string; baseRef: string }): string {
	return (
		readIdentity({ lotFolder: params.lotFolder })?.base.commit ??
		tryReadGit({ root: params.worktree, args: ['merge-base', 'HEAD', params.baseRef] })?.trim() ??
		''
	)
}

/**
 * A merged lot committed: its landed fact written, its hand-over entry committed, the line naming how it landed, the
 * work it holds since (it lands in a new lot), and the close line; nothing pushed.
 */
function landedLot(params: {
	lot: string
	worktree: string
	branch: string
	base: string
	lotFolder: string
	fact: LandedFact
}): LandingResult {
	const { fact, worktree } = params
	writeLanded({ lotFolder: params.lotFolder, fact })
	recordHandoverState({
		store: findHandoverStore(worktree),
		folder: params.lotFolder,
		state: 'committed',
	})
	const since = workSinceLanding({
		root: worktree,
		branch: params.branch,
		cut: cutOf({
			worktree,
			lotFolder: params.lotFolder,
			baseRef: `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`,
		}),
		landedTip: fact.tip,
	})
	return {
		exitCode: 0,
		lines: [
			fillMessage({ template: LANDING_LINES.committed, values: { landed: landedLineOf(fact) } }),
			...(since.length === 0
				? []
				: [
						fillMessage({
							template: LANDING_LINES.workSince,
							values: { work: workSinceLandingText(since) },
						}),
					]),
			fillMessage({ template: LANDING_LINES.closeLanded, values: { lot: params.lot } }),
		],
	}
}

/**
 * What the worktree holds that is not committed: the paths git status lists (untracked ones too, ignored ones not), and
 * whether a tracked file is among them (git then refuses to rebase).
 */
function readWorkInProgress(params: { worktree: string }): { files: number; tracked: boolean } {
	// every untracked file on its own line, whatever the person's status.showUntrackedFiles
	const paths = readGit({
		root: params.worktree,
		args: ['status', '--porcelain', '--untracked-files=all'],
	})
		.split('\n')
		.filter(Boolean)
	return {
		files: paths.length,
		tracked: paths.some((path) => !path.startsWith(UNTRACKED_STATUS_PREFIX)),
	}
}

/**
 * The lot rebased onto `origin/<base>` when it does not hold it; a conflict aborts the rebase and is a refusal. With a tracked file changed (`trackedChanges`) git refuses to rebase: the lot
 * stays as committed, the line saying the rebase waits for a clean worktree.
 */
function rebaseOnOrigin(params: {
	worktree: string
	base: string
	trackedChanges: boolean
}): { line?: string } | { refusal: string } {
	const { worktree, base } = params
	const originTip = tryReadGit({
		root: worktree,
		args: ['rev-parse', '--verify', '--quiet', `${ORIGIN_BRANCH_REF_PREFIX}${base}`],
	})?.trim()
	if (originTip === undefined) return {}
	if (isAncestorCommit({ root: worktree, ancestor: originTip, descendant: 'HEAD' })) return {}
	if (params.trackedChanges) return { line: LANDING_LINES.notRebased.replace('{base}', () => base) }
	const rebase = spawnSync('git', ['rebase', '--quiet', originTip], {
		cwd: worktree,
		encoding: 'utf8',
	})
	if (rebase.status === 0)
		return {
			line: LANDING_LINES.rebased
				.replace('{base}', () => base)
				.replace('{commit}', originTip.slice(0, SHORT_SHA_LENGTH)),
		}
	const files = readGit({ root: worktree, args: ['diff', '--name-only', '--diff-filter=U'] })
		.split('\n')
		.filter(Boolean)
	spawnSync('git', ['rebase', '--abort'], { cwd: worktree })
	const overwritten = overwrittenFilesOf(rebase.stderr)
	if (files.length === 0 && overwritten.length > 0)
		return {
			refusal: LANDING_LINES.overwrite
				.replace('{base}', () => base)
				.replace('{files}', () => overwritten.join(', ')),
		}
	return {
		refusal: LANDING_LINES.conflict
			.replaceAll('{base}', () => base)
			.replace('{files}', () => (files.length > 0 ? files.join(', ') : 'the lot')),
	}
}

/** The untracked files git names when a checkout would overwrite them (tab-indented after its error line). */
function overwrittenFilesOf(stderr: string): string[] {
	const lines = stderr.split('\n')
	const start = lines.findIndex((line) => OVERWRITE_PATTERN.test(line))
	if (start === -1) return []
	const files: string[] = []
	for (const line of lines.slice(start + 1)) {
		if (!line.startsWith('\t')) break
		files.push(line.trim())
	}
	return files
}

/**
 * The refusal of a lot whose HEAD origin's base already holds (no commit of its own to land); undefined when it holds
 * one, or origin has no such base.
 */
function nothingBeyondBase(params: {
	worktree: string
	branch: string
	base: string
}): string | undefined {
	const { worktree } = params
	const originBase = `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`
	if (
		tryReadGit({ root: worktree, args: ['rev-parse', '--verify', '--quiet', originBase] }) ===
		undefined
	)
		return undefined
	if (!isAncestorCommit({ root: worktree, ancestor: 'HEAD', descendant: originBase }))
		return undefined
	const head = readGit({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	return NOTHING_BEYOND_BASE_LINE.replace('{branch}', () => params.branch)
		.replace('{base}', () => params.base)
		.replace('{head}', head.slice(0, SHORT_SHA_LENGTH))
}

/**
 * The head the push's lease expects on origin: the one the lot's last push recorded (`landing.json`, written right
 * after each push), else origin's branch when origin's base holds it (it carries no work: an earlier push of a
 * landing that opened no pull request), else none (the branch must not exist on origin).
 */
function leaseOf(params: {
	worktree: string
	branch: string
	base: string
	lotFolder: string
}): string {
	const { worktree, branch } = params
	const raw = readRawLanding({ lotFolder: params.lotFolder })
	if (raw?.branch === branch && typeof raw.head === 'string') return raw.head
	const remote = tryReadGit({
		root: worktree,
		args: ['rev-parse', '--verify', '--quiet', `${ORIGIN_BRANCH_REF_PREFIX}${branch}`],
	})?.trim()
	if (remote === undefined) return ''
	return isAncestorCommit({
		root: worktree,
		ancestor: remote,
		descendant: `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`,
	})
		? remote
		: ''
}

/**
 * The head just pushed kept in `landing.json`, whole or not at all: its other fields kept for the same branch, dropped
 * for another (a pull request number and its url of another branch are not this landing's).
 */
function recordPushedHead(params: { lotFolder: string; branch: string; head: string }): void {
	const existing = readRawLanding({ lotFolder: params.lotFolder })
	const raw = existing?.branch === params.branch ? existing : {}
	replaceWhole({
		path: join(params.lotFolder, LANDING_FILE),
		text: `${JSON.stringify({ ...raw, schema: LANDING_SCHEMA, branch: params.branch, head: params.head }, null, 2)}\n`,
	})
}

/**
 * Pushes the lot's branch with a lease pinned to `expected` (the head its last landing pushed; empty: the branch must
 * not exist on origin), never a prompt; git's first line when it refuses.
 */
function pushLot(params: {
	worktree: string
	branch: string
	expected: string
}): string | undefined {
	const ref = `refs/heads/${params.branch}`
	const push = spawnSync(
		'git',
		[
			'push',
			'--quiet',
			`--force-with-lease=${ref}:${params.expected}`,
			'-u',
			'origin',
			`${ref}:${ref}`,
		],
		{
			cwd: params.worktree,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
		},
	)
	if (push.status === 0) return undefined
	// git writes `To <remote>` first: the rejected line says why
	return (
		PUSH_REJECTED_PATTERN.exec(push.stderr)?.[0]?.trim() ??
		(push.stderr.trim().split('\n').at(-1) || `exit ${push.status}`)
	)
}

/** A new pull request of the lot, a draft, with its text (titled with the lot's message). */
function openLot(params: {
	worktree: string
	branch: string
	base: string
	host: HostAdapter
	text: PullRequestText
}): PullRequest | { refusal: string } {
	return params.host.openPullRequest({
		root: params.worktree,
		branch: params.branch,
		base: params.base,
		title: params.text.title,
		body: params.text.body,
		draft: true,
	})
}

/**
 * The lot's text rendered from its records on the tree just pushed (`preparePullRequest`, the template's parts), a
 * person's part of the current body (`kept`) kept; the refusal of records that no longer pass.
 */
function renderedText(params: {
	worktree: string
	/** The ref the lot's changes are read against: origin's base, or the stack parent's tip while it is open. */
	baseRef: string
	lotFolder: string
	kept: string | undefined
}): PullRequestText | { refusal: string } {
	const prepared = preparePullRequest({
		lotFolder: params.lotFolder,
		worktree: params.worktree,
		baseRef: params.baseRef,
	})
	if ('refusal' in prepared) return prepared
	const kept =
		params.kept === undefined
			? { kept: undefined }
			: keptPartOf({ template: prepared.template, body: params.kept })
	if ('refusal' in kept) return kept
	return composePullRequest({ ...prepared, kept: kept.kept })
}

/**
 * The lot's pull request given `text`: one whose title or body reads otherwise (opened before, renamed or edited by
 * hand, or records changed since) is edited, its line saying so; one that reads the same is not asked of the host.
 */
function editLot(params: {
	worktree: string
	host: HostAdapter
	pullRequest: PullRequest
	text: PullRequestText
}): { line?: string } | { refusal: string } {
	const { pullRequest, text } = params
	if (pullRequest.title === text.title && linesOf(pullRequest.body).join('\n') === text.body)
		return {}
	const refused = params.host.editPullRequest({
		root: params.worktree,
		number: pullRequest.number,
		...text,
	})
	if (refused !== undefined) return refused
	return { line: LANDING_LINES.updated.replace('{number}', String(pullRequest.number)) }
}

/** The landing record of the lot (`landing.json` in its store folder). */
function writeLanding(params: {
	lotFolder: string
	pullRequest: PullRequest
	branch: string
	head: string
	now: Date
}): void {
	const record: LandingRecord = {
		schema: LANDING_SCHEMA,
		number: params.pullRequest.number,
		url: params.pullRequest.url,
		branch: params.branch,
		head: params.head,
		at: params.now.toISOString(),
	}
	// whole or not at all: a crash mid-write never truncates the record
	replaceWhole({
		path: join(params.lotFolder, LANDING_FILE),
		text: `${JSON.stringify(record, null, 2)}\n`,
	})
}

/**
 * The design gate of a store lot's landing (DESIGN-GATE section 3): its base snapshot recorded again at `baseRef`, then
 * its design held at the lot base the rebased worktree resolves; undefined for a folder that is no store lot, or when
 * the design lets the lot go on.
 */
function landingDesignRefusalOf(params: {
	lotFolder: string
	worktree: string
	baseRef: string
}): string | undefined {
	const { lotFolder, worktree } = params
	if (readIdentity({ lotFolder }) === undefined) return undefined
	recordBaseDeclared({ lotFolder, root: worktree, ref: params.baseRef })
	const base = resolveTddBase({ root: worktree, packageJson: readPackageJson(worktree) })
	if ('failure' in base) return base.failure
	return designGateOf({ lotFolder, root: worktree, base: base.commit, verb: 'land' }).refusal
}

function refused(line: string): LandingResult {
	return { exitCode: 1, lines: [line] }
}
