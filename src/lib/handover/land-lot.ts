/**
 * A lot lands through its pull request (33CI CI3). The worktree is on the lot's branch; origin is fetched (a failure
 * stops the landing). A push carries only commits: the committed head lands, work in progress stays where it is and is
 * named (with a tracked file changed, git cannot rebase: the lot is pushed as committed, the line saying so). A pull request the lot's landing already merged makes the lot committed, nothing
 * pushed. Otherwise the lot is rebased onto origin's base branch when behind (a conflict undone and named), pushed
 * with a lease pinned to the head its last landing pushed (a branch it never pushed must not exist on origin), its open
 * pull request reused or a new one opened (its title and body rendered from the lot's records, `lot pr`'s template; a reused one edited when it
 * reads otherwise), queued unless a draft - the merge queue
 * merges it once its checks pass on top of main - and the landing recorded: `landing.json` in the lot's folder (with
 * every head a rebase of the lot's landings replaced, so `lot close` knows those commits landed), and
 * the lot's hand-over entry (state pending; committed once its pull request merged) that `lot status`, `plan next` and
 * `lot close` read.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { counted } from '../counted.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { fetchOrigin, isAncestorCommit, readGit, tryReadGit } from '../git.ts'
import { composePullRequest, keptTextOf, linesOf } from '../pr/compose-pull-request.ts'
import { preparePullRequest } from '../pr/pull-request-sources.ts'
import { replaceWhole } from '../store/publish.ts'
import { STORE_REFUSAL } from '../store/store.constants.ts'
import { findHandoverStore, recordHandoverState, registerHandover } from './handover-store.ts'
import {
	LANDING_FILE,
	LANDING_LINES,
	LANDING_SCHEMA,
	PUSH_REJECTED_PATTERN,
	PUSHED_OUTSIDE_PATTERN,
	OVERWRITE_PATTERN,
	UNTRACKED_STATUS_PREFIX,
} from './land-lot.constants.ts'
import { LANDING_MERGED_AT_OTHER_HEAD, NOTHING_BEYOND_BASE_LINE } from './land-push.constants.ts'
import { readLanding, readRawLanding, readReplacedHeads } from './land-record.ts'

import type { HostAdapter, PullRequest } from '../host/host.types.ts'
import type { PullRequestText } from '../pr/pull-request.types.ts'
import type { LandingRecord, LandingResult } from './land-lot.types.ts'

/**
 * Lands the lot on `branch` checked out in `worktree` into `base` through `host`; `draft` opens a draft and never
 * queues it (CI runs on every push while the lot goes on). Never throws for a refusal: its line, exit 1.
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
	draft: boolean
	now: Date
}): LandingResult {
	const { worktree, branch, base, host } = params
	const unready = unreadyRefusal({ worktree, branch, base, lotFolder: params.lotFolder })
	if (unready !== undefined) return refused(unready)
	const fetched = fetchRefusal({ worktree, base })
	if (fetched !== undefined) return refused(fetched)
	const landing = readLanding({ lotFolder: params.lotFolder })
	const known = readKnownPullRequest({ worktree, branch, landing, host })
	if ('refusal' in known)
		return refused(LANDING_LINES.hostRefused.replace('{reason}', () => known.refusal))
	if (known.pullRequest?.state === 'merged')
		return mergedLanding({ ...params, pullRequest: known.pullRequest })
	// the lot's hand-over entry first: a refusal (a lot committed by a local hand-over) stops before any push, so a lot
	// main already holds gets the registry's committed answer before the one below
	const registered = registerLotEntry({ ...params })
	if ('refusal' in registered) return refused(registered.refusal)
	// a branch the base already holds has nothing to land: refused before any push or pull request
	const empty = nothingBeyondBase({ worktree, branch, base })
	if (empty !== undefined) return refused(empty)
	const { entry } = registered
	const lines: string[] = []
	const progress = readWorkInProgress({ worktree })
	const rebased = rebaseOnOrigin({ worktree, base, trackedChanges: progress.tracked })
	if ('refusal' in rebased) return refused(rebased.refusal)
	if (rebased.line) lines.push(rebased.line)
	// kept at once: a push or a host refusal after the rebase must not lose it (the next landing rebases nothing)
	if (rebased.replaced !== undefined)
		recordReplacedHead({ lotFolder: params.lotFolder, branch, head: rebased.replaced })
	if (progress.files > 0)
		lines.push(
			LANDING_LINES.workInProgress.replace('{files}', () =>
				counted({ count: progress.files, noun: 'file' }),
			),
		)
	// rendered on the rebased head, before the push: a text that no longer renders pushes nothing
	const text = renderedText({ ...params, kept: known.pullRequest?.body })
	if ('refusal' in text)
		return {
			exitCode: 1,
			lines: [...lines, LANDING_LINES.unrendered.replace('{reason}', () => text.refusal)],
		}
	const head = readGit({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
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
	return publishLanding({ ...params, known: known.pullRequest, text, head, entry, lines })
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
 * Why the lot cannot land yet, before anything is fetched, asked of the host or pushed: its worktree is not on its
 * branch, or its records do not render a public pull request text (`preparePullRequest`).
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
	const checked = preparePullRequest({
		lotFolder: params.lotFolder,
		worktree,
		baseRef: `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`,
	})
	return 'refusal' in checked
		? LANDING_LINES.unrendered.replace('{reason}', () => checked.refusal)
		: undefined
}

/**
 * After the push: the lot's pull request, its text rendered on the pushed head (`lot pr`'s template), reused or opened
 * with it, the landing recorded at once (the next push's lease needs its head, whatever the host
 * answers next), a reused one edited when its title or body reads otherwise, then queued unless a draft. `lines` holds
 * what the landing said so far.
 */
function publishLanding(params: {
	lot: string
	worktree: string
	branch: string
	base: string
	lotFolder: string
	host: HostAdapter
	draft: boolean
	now: Date
	known: PullRequest | undefined
	/** The lot's text, rendered on the head just pushed. */
	text: PullRequestText
	head: string
	entry: string
	lines: string[]
}): LandingResult {
	const { worktree, branch, host, known, text } = params
	const lines = [...params.lines]
	const pull = known ?? openLot({ ...params, text })
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
		replaced: readReplacedHeads({ lotFolder: params.lotFolder, branch }),
		now: params.now,
	})
	const edited = editLot({ worktree, host, pullRequest: pull, text })
	if ('refusal' in edited)
		return {
			exitCode: 1,
			lines: [...lines, LANDING_LINES.hostRefused.replace('{reason}', () => edited.refusal)],
		}
	if (edited.line !== undefined) lines.push(edited.line)
	lines.push(
		LANDING_LINES.closeWhenMerged
			.replace('{entry}', () => params.entry)
			.replace('{lot}', () => params.lot),
	)
	if (params.draft)
		return {
			exitCode: 0,
			lines: [
				...lines,
				pull.draft
					? LANDING_LINES.draft
					: LANDING_LINES.notDraft.replace('{number}', String(pull.number)),
			],
		}
	const queued = host.queuePullRequest({ root: worktree, number: pull.number, draft: pull.draft })
	if (queued !== undefined)
		return {
			exitCode: 1,
			lines: [...lines, LANDING_LINES.hostRefused.replace('{reason}', () => queued.refusal)],
		}
	return { exitCode: 0, lines: [...lines, LANDING_LINES.queued] }
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

/** The lot's merged pull request: the lot committed when it holds nothing since that head, refused otherwise. */
function mergedLanding(params: {
	worktree: string
	lotFolder: string
	pullRequest: PullRequest
}): LandingResult {
	const { pullRequest } = params
	const head = readGit({ root: params.worktree, args: ['rev-parse', 'HEAD'] }).trim()
	if (head !== pullRequest.head)
		return refused(
			LANDING_LINES.mergedThenMoved
				.replace('{number}', String(pullRequest.number))
				.replace('{merged}', pullRequest.head.slice(0, SHORT_SHA_LENGTH))
				.replace('{head}', head.slice(0, SHORT_SHA_LENGTH)),
		)
	recordHandoverState({
		store: findHandoverStore(params.worktree),
		folder: params.lotFolder,
		state: 'committed',
	})
	return {
		exitCode: 0,
		lines: [
			LANDING_LINES.committed
				.replace('{number}', String(pullRequest.number))
				.replace('{commit}', head.slice(0, SHORT_SHA_LENGTH))
				.replace('{url}', () => pullRequest.url),
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
 * The lot rebased onto `origin/<base>` when it does not hold it, `replaced` the head the rebase replaced; a conflict
 * aborts the rebase and is a refusal. With a tracked file changed (`trackedChanges`) git refuses to rebase: the lot
 * stays as committed, the line saying the rebase waits for a clean worktree.
 */
function rebaseOnOrigin(params: {
	worktree: string
	base: string
	trackedChanges: boolean
}): { line?: string; replaced?: string } | { refusal: string } {
	const { worktree, base } = params
	const originTip = tryReadGit({
		root: worktree,
		args: ['rev-parse', '--verify', '--quiet', `${ORIGIN_BRANCH_REF_PREFIX}${base}`],
	})?.trim()
	if (originTip === undefined) return {}
	if (isAncestorCommit({ root: worktree, ancestor: originTip, descendant: 'HEAD' })) return {}
	if (params.trackedChanges) return { line: LANDING_LINES.notRebased.replace('{base}', () => base) }
	const replaced = readGit({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const rebase = spawnSync('git', ['rebase', '--quiet', originTip], {
		cwd: worktree,
		encoding: 'utf8',
	})
	if (rebase.status === 0)
		return {
			line: LANDING_LINES.rebased
				.replace('{base}', () => base)
				.replace('{commit}', originTip.slice(0, SHORT_SHA_LENGTH)),
			replaced,
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
 * The landing record with `head` added to the heads the lot's rebases replaced (written at once, before the push):
 * the record kept as it is otherwise; a lot with no landing yet gets a record holding only its branch and those heads.
 */
function recordReplacedHead(params: { lotFolder: string; branch: string; head: string }): void {
	const raw = readRawLanding({ lotFolder: params.lotFolder }) ?? {}
	const record = {
		...raw,
		schema: LANDING_SCHEMA,
		branch: params.branch,
		replaced: [...readReplacedHeads(params), params.head],
	}
	// whole or not at all: a crash mid-write never truncates the record (its head and replaced heads)
	replaceWhole({
		path: join(params.lotFolder, LANDING_FILE),
		text: `${JSON.stringify(record, null, 2)}\n`,
	})
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
 * for another (a pull request number, its url and the replaced heads of another branch are not this landing's).
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

/** A new pull request of the lot, with its text (titled with the lot's message). */
function openLot(params: {
	worktree: string
	branch: string
	base: string
	host: HostAdapter
	draft: boolean
	text: PullRequestText
}): PullRequest | { refusal: string } {
	return params.host.openPullRequest({
		root: params.worktree,
		branch: params.branch,
		base: params.base,
		title: params.text.title,
		body: params.text.body,
		draft: params.draft,
	})
}

/**
 * The lot's text rendered from its records on the tree just pushed (`preparePullRequest`, the template's parts), a
 * person's part of the current body (`kept`) kept; the refusal of records that no longer pass.
 */
function renderedText(params: {
	worktree: string
	base: string
	lotFolder: string
	kept: string | undefined
}): PullRequestText | { refusal: string } {
	const prepared = preparePullRequest({
		lotFolder: params.lotFolder,
		worktree: params.worktree,
		baseRef: `${ORIGIN_BRANCH_REF_PREFIX}${params.base}`,
	})
	if ('refusal' in prepared) return prepared
	return composePullRequest({
		...prepared,
		kept:
			params.kept === undefined
				? undefined
				: keptTextOf({ template: prepared.template, body: params.kept }),
	})
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
	replaced: readonly string[]
	now: Date
}): void {
	const record: LandingRecord = {
		schema: LANDING_SCHEMA,
		number: params.pullRequest.number,
		url: params.pullRequest.url,
		branch: params.branch,
		head: params.head,
		replaced: [...params.replaced],
		at: params.now.toISOString(),
	}
	// whole or not at all: a crash mid-write never truncates the record (its head and replaced heads)
	replaceWhole({
		path: join(params.lotFolder, LANDING_FILE),
		text: `${JSON.stringify(record, null, 2)}\n`,
	})
}

/**
 * A lot whose landing's pull request merged is committed when it merged at the head the landing recorded, or at the
 * worktree's HEAD (the lot's tip, pushed outside `lot land`: the record then takes that head, the one it named kept in
 * `replaced`); its hand-over entry says so, the line naming the pull request. Merged at another head: a line naming
 * the heads, nothing marked. A host that cannot say (offline, `gh` missing) changes nothing, its line says why.
 * Undefined when there is no landing, or the pull request is not merged.
 *
 * @intent mark a lot committed once the merge queue landed it
 * @internal
 */
export function confirmLanding(params: {
	root: string
	lotFolder: string
	/** The lot's worktree, whose HEAD is the lot's tip; left out when it has none. */
	worktree?: string
	host: HostAdapter
}): string | undefined {
	const landing = readLanding({ lotFolder: params.lotFolder })
	if (landing === undefined) return undefined
	const pullRequest = params.host.readPullRequest({
		root: params.root,
		ref: String(landing.number),
	})
	if (pullRequest !== undefined && 'refusal' in pullRequest)
		return LANDING_LINES.hostSilent
			.replace('{number}', String(landing.number))
			.replace('{reason}', () => pullRequest.refusal)
	if (pullRequest === undefined || pullRequest.state !== 'merged') return undefined
	if (pullRequest.head !== landing.head) {
		const tip =
			params.worktree === undefined
				? undefined
				: tryReadGit({ root: params.worktree, args: ['rev-parse', 'HEAD'] })?.trim()
		if (pullRequest.head !== tip)
			return LANDING_MERGED_AT_OTHER_HEAD.replace('{number}', String(pullRequest.number))
				.replace('{merged}', pullRequest.head.slice(0, SHORT_SHA_LENGTH))
				.replace('{landed}', landing.head.slice(0, SHORT_SHA_LENGTH))
				.replace('{head}', (tip ?? 'none').slice(0, SHORT_SHA_LENGTH))
		refreshLandingHead({ lotFolder: params.lotFolder, landing, head: pullRequest.head })
	}
	recordHandoverState({
		store: findHandoverStore(params.root),
		folder: params.lotFolder,
		state: 'committed',
	})
	return LANDING_LINES.committed
		.replace('{number}', String(pullRequest.number))
		.replace('{commit}', pullRequest.head.slice(0, SHORT_SHA_LENGTH))
		.replace('{url}', () => pullRequest.url)
}

/** The landing record's head moved to `head` (what merged), the head it named kept last in `replaced`. */
function refreshLandingHead(params: {
	lotFolder: string
	landing: LandingRecord
	head: string
}): void {
	const raw = readRawLanding({ lotFolder: params.lotFolder }) ?? {}
	const record = {
		...raw,
		head: params.head,
		replaced: [...params.landing.replaced, params.landing.head],
	}
	// whole or not at all, as every landing record write
	replaceWhole({
		path: join(params.lotFolder, LANDING_FILE),
		text: `${JSON.stringify(record, null, 2)}\n`,
	})
}

function refused(line: string): LandingResult {
	return { exitCode: 1, lines: [line] }
}
