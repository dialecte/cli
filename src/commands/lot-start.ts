/**
 * `dialecte lot start <brief.json> [--effort low|medium|high] [--dry-run] [--json]`: checks the brief, claims an
 * index, publishes the lot folder, makes the worktree and its link (33S section 5, `lot start`, in order). Each step
 * is an exported function, so the race of two starts can be played in a forced order.
 */
import { linkSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { branchExists } from '../lib/git.ts'
import { HANDOVER_STORE_FOLDER } from '../lib/handover/handover.constants.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { BRIEF_EFFORTS } from '../lib/store/brief.constants.ts'
import { checkBrief } from '../lib/store/brief.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { lotUsageExit } from '../lib/store/lot-exits.ts'
import { failedNextOf, manualNextOf, startNextOf } from '../lib/store/lot-next.ts'
import { overlappingOpenLots, readLotScope } from '../lib/store/lot-records.ts'
import { removeDeadLeftovers, temporaryPidOf } from '../lib/store/publish.ts'
import { locateStore, publishLotFolder, removeStoreLeftovers } from '../lib/store/store-folder.ts'
import { appendStoreList, storeListRefusal } from '../lib/store/store-list.ts'
import { LOT_LINK_SEGMENTS, RUNNERS, STORE_REFUSAL } from '../lib/store/store.constants.ts'
import { appendTransition } from '../lib/store/transitions.ts'
import { WORKTREES_FOLDER } from '../lib/workspace.constants.ts'
import { addWorktree } from '../lib/worktree/add-worktree.ts'
import {
	claimWorktreeIndex,
	nextWorktreeIndex,
	worktreeFolderName,
} from '../lib/worktree/worktree-index.ts'
import {
	BRANCH_MADE_SUFFIX,
	DEFAULT_EFFORT,
	ENGINE,
	IDENTITY_SCHEMA,
	LINK_REFUSED_NOTE,
	OVERLAP_REASON,
	PROBE_NAME,
	PROBE_SOURCE,
	PROBE_TARGET,
	START_FLAGS,
	START_REASON,
	START_VALUE_OPTIONS,
} from './lot-start.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { BriefEffort, CheckedBrief } from '../lib/store/brief.types.ts'
import type {
	LotIdentity,
	Refusal,
	Transition,
	TransitionCauseKind,
} from '../lib/store/store.types.ts'
import type {
	LinkFunction,
	LotWorktreeResult,
	StartSeams,
	SymlinkFunction,
} from './lot-start.types.ts'

/**
 * Starts the lot of a brief (or checks it with `--dry-run`); every exit is JSON under `--json`, a usage error and a
 * refused brief included (exit 2, `next: null`).
 */
export function startLot(params: {
	cwd: string
	/** The words after the verb: `<brief.json>` and the options. */
	argv: string[]
	now?: Date
	seams?: StartSeams
}): CommandResult {
	const now = params.now ?? new Date()
	const read = readArguments({
		argv: params.argv,
		valueOptions: START_VALUE_OPTIONS,
		flags: START_FLAGS,
	})
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	const [briefPath, ...extra] = read.words
	if (briefPath === undefined)
		return lotUsageExit({ reason: 'lot start takes one brief: none given', json })
	if (extra.length > 0)
		return lotUsageExit({
			reason: `lot start takes one brief, not also ${extra.join(' ')}`,
			json,
		})
	const effortFlag = read.values.get('effort')
	if (effortFlag !== undefined && !BRIEF_EFFORTS.includes(effortFlag as BriefEffort))
		return lotUsageExit({
			reason: `--effort ${effortFlag} is not one of ${BRIEF_EFFORTS.join(', ')}`,
			json,
		})
	const checked = checkBrief({ briefPath, cwd: params.cwd })
	if (!checked.checked) return refusedOutput({ refused: checked.refused, json })
	const brief = checked.checked
	const worktreesFolder = join(dirname(brief.repository), WORKTREES_FOLDER)
	// the store list is refused for a dry run too: it says what a real start would meet
	const listRefusal = storeListRefusal({})
	if (listRefusal) return errorOutput({ exitCode: 2, message: listRefusal, json })
	if (read.flags.has('dry-run')) return dryRunOutput({ brief, briefPath, worktreesFolder, json })
	try {
		return startChecked({
			brief,
			worktreesFolder,
			effort: effortOf({ flag: effortFlag as BriefEffort | undefined, brief }),
			json,
			now,
			seams: params.seams ?? {},
		})
	} catch (error) {
		return errorOutput({
			exitCode: (error as Error).name === STORE_REFUSAL ? 2 : 1,
			message: (error as Error).message,
			json,
		})
	}
}

/**
 * The race re-check (33S section 5): `lotFolder`, published, is checked against every open real lot of its store.
 * On an overlap it publishes `failed` (cause `overlap`) on its own lot and returns the name of the lot it overlaps
 * with, the transition stamped `now`; undefined when it may go on.
 */
export function recheckOverlap(params: {
	lotFolder: string
	caseInsensitive: boolean
	now: Date
}): string | undefined {
	const store = dirname(params.lotFolder)
	const [overlap] = overlappingOpenLots({
		store,
		registry: join(dirname(store), HANDOVER_STORE_FOLDER),
		scope: readLotScope({ lotFolder: params.lotFolder }),
		caseInsensitive: params.caseInsensitive,
		except: basename(params.lotFolder),
	})
	if (overlap === undefined) return undefined
	publishFailure({
		lotFolder: params.lotFolder,
		kind: 'overlap',
		reason: OVERLAP_REASON.replace('{lot}', overlap.name),
		now: params.now,
	})
	return overlap.name
}

/**
 * Makes the worktree of a published lot at its recorded base commit, then the `.dialecte/lot` link. A failure
 * publishes `failed` (cause `fail`) on the lot and is returned; nothing is removed.
 */
export function makeLotWorktree(params: {
	lotFolder: string
	now: Date
	seams?: Pick<StartSeams, 'addWorktree' | 'symlink'>
}): LotWorktreeResult {
	const identity = readIdentity({ lotFolder: params.lotFolder })
	if (identity === undefined) throw new Error(`${params.lotFolder} holds no readable identity.json`)
	const make = params.seams?.addWorktree ?? addWorktree
	let failure: string
	try {
		const made = make({
			repository: identity.repository,
			branch: identity.branch,
			from: identity.base.commit,
			index: identity.index,
			now: params.now,
		})
		if (typeof made !== 'string')
			return linkLotFolder({
				worktree: made.worktree,
				lotFolder: params.lotFolder,
				symlink: params.seams?.symlink ?? symlinkSync,
			})
		failure = made
	} catch (error) {
		failure = (error as Error).message
	}
	const reason = branchExists({ root: identity.repository, branch: identity.branch })
		? `${failure}${BRANCH_MADE_SUFFIX.replace('{branch}', identity.branch)}`
		: failure
	publishFailure({ lotFolder: params.lotFolder, kind: 'fail', reason, now: params.now })
	return { failed: reason }
}

/**
 * Probes a hard link in `folder` (a temporary file linked, then both removed): undefined when the file system
 * makes one, else the reason it refuses.
 */
export function probeHardLinks(params: {
	folder: string
	link?: LinkFunction
}): string | undefined {
	const link = params.link ?? linkSync
	const source = join(params.folder, PROBE_SOURCE.replace('{pid}', String(process.pid)))
	const target = join(params.folder, PROBE_TARGET.replace('{pid}', String(process.pid)))
	try {
		writeFileSync(source, '')
		link(source, target)
		return undefined
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code
		return `${params.folder} makes no hard link${code ? ` (${code})` : ''}: ${(error as Error).message}; the store publishes its records by hard links`
	} finally {
		rmSync(source, { force: true })
		rmSync(target, { force: true })
	}
}

/**
 * The start after the checks: the dead probes' leftovers swept, the probe, the store list, the claim, the lot
 * folder, the re-check, the worktree.
 */
function startChecked(params: {
	brief: CheckedBrief
	worktreesFolder: string
	effort: LotIdentity['effort']
	json: boolean
	now: Date
	seams: StartSeams
}): CommandResult {
	const { brief, now, seams, json } = params
	const store = locateStore({ from: brief.repository })?.store
	if (store === undefined)
		return errorOutput({ exitCode: 2, message: `${brief.repository} holds no git folder`, json })
	mkdirSync(store, { recursive: true })
	removeDeadLeftovers({
		folder: store,
		pidOf: (name) => temporaryPidOf({ name, finalName: PROBE_NAME }),
		kind: 'files',
	})
	const probe = probeHardLinks({ folder: store, link: seams.link })
	if (probe) return errorOutput({ exitCode: 2, message: probe, json })
	removeStoreLeftovers({ store })
	appendStoreList({ store })
	const index = claimWorktreeIndex({
		worktreesFolder: params.worktreesFolder,
		afterPick: seams.afterClaimPick,
	})
	const name = worktreeFolderName({ index, repository: brief.repository, branch: brief.branch })
	const lotFolder = join(store, name)
	seams.beforePublish?.()
	const published = publishLotFolder({
		store,
		name,
		brief: brief.briefBytes,
		plan: brief.plan.bytes,
		firstTransition: firstTransitionOf({ name, steps: brief.steps.length, now }),
		identity: identityOf({
			brief,
			name,
			index,
			store,
			worktreesFolder: params.worktreesFolder,
			effort: params.effort,
			now,
		}),
	})
	if (!published)
		return errorOutput({
			exitCode: 1,
			message: `${lotFolder} exists already: the store is damaged, the index ${index} stays claimed`,
			json,
		})
	const overlap = recheckOverlap({ lotFolder, caseInsensitive: brief.caseInsensitive, now })
	if (overlap)
		return failedOutput({
			name,
			lotFolder,
			reason: OVERLAP_REASON.replace('{lot}', overlap),
			json,
		})
	const made = makeLotWorktree({ lotFolder, now, seams })
	if ('failed' in made) return failedOutput({ name, lotFolder, reason: made.failed, json })
	return startedOutput({
		name,
		lotFolder,
		worktree: made.worktree,
		notes: 'linkRefused' in made ? [made.linkRefused] : [],
		json,
	})
}

/**
 * Makes `<worktree>/.dialecte/lot`, a link to the lot folder. A link that cannot be made does not fail the lot (its
 * worktree exists): the reason is returned, and `status` reports the link missing.
 */
function linkLotFolder(params: {
	worktree: string
	lotFolder: string
	symlink: SymlinkFunction
}): LotWorktreeResult {
	const link = join(params.worktree, ...LOT_LINK_SEGMENTS)
	try {
		mkdirSync(dirname(link), { recursive: true })
		params.symlink(params.lotFolder, link)
		return { worktree: params.worktree, link }
	} catch (error) {
		return {
			worktree: params.worktree,
			linkRefused: LINK_REFUSED_NOTE.replace('{link}', link).replace(
				'{reason}',
				(error as Error).message,
			),
		}
	}
}

/** An exit before any lot exists (or a step that broke): the message, and no next command. */
function errorOutput(params: { exitCode: number; message: string; json: boolean }): CommandResult {
	return {
		exitCode: params.exitCode,
		output: params.json
			? JSON.stringify({ error: params.message, next: null }, null, 2)
			: `lot start: ${params.message}`,
	}
}

/** A lot published then failed: its name, folder, the reason, and the stop line. */
function failedOutput(params: {
	name: string
	lotFolder: string
	reason: string
	json: boolean
}): CommandResult {
	const next = failedNextOf(params.name)
	if (params.json)
		return {
			exitCode: 1,
			output: JSON.stringify(
				{
					lot: params.name,
					folder: params.lotFolder,
					state: 'failed',
					reason: params.reason,
					next,
				},
				null,
				2,
			),
		}
	return {
		exitCode: 1,
		output: [
			`${params.name} failed: ${params.reason}`,
			`folder: ${params.lotFolder}`,
			`next: ${next}`,
		].join('\n'),
	}
}

/** `--effort`, else the brief's, else the default; with where it came from. */
function effortOf(params: {
	flag: BriefEffort | undefined
	brief: CheckedBrief
}): LotIdentity['effort'] {
	if (params.flag) return { level: params.flag, source: 'flag' }
	if (params.brief.effort) return { level: params.brief.effort, source: 'brief' }
	return { level: DEFAULT_EFFORT, source: 'default' }
}

/** Transition 1 (D4): working, step 0 (no station has run) of the brief's steps, cause start. */
function firstTransitionOf(params: { name: string; steps: number; now: Date }): Transition {
	return {
		seq: 1,
		at: params.now.toISOString(),
		lot: params.name,
		state: 'working',
		position: { step: 0, of: params.steps, station: null, round: null },
		cause: { kind: 'start', by: ENGINE, reason: START_REASON },
		question: null,
		simulated: false,
	}
}

/** `identity.json` (D3): real paths, the base as given and its commit, both hashes, the cli version. */
function identityOf(params: {
	brief: CheckedBrief
	name: string
	index: string
	store: string
	worktreesFolder: string
	effort: LotIdentity['effort']
	now: Date
}): LotIdentity {
	const { brief } = params
	return {
		schema: IDENTITY_SCHEMA,
		name: params.name,
		index: params.index,
		repository: brief.repository,
		store: params.store,
		worktree: join(params.worktreesFolder, params.name),
		branch: brief.branch,
		base: brief.base,
		feature: brief.feature,
		effort: params.effort,
		simulated: false,
		scenario: null,
		cli: readCliVersion(),
		briefHash: brief.briefHash,
		planHash: brief.plan.hash,
		created: params.now.toISOString(),
	}
}

/** Publishes `failed` on the lot, its position repeating the last transition's. */
function publishFailure(params: {
	lotFolder: string
	kind: TransitionCauseKind
	reason: string
	now: Date
}): void {
	appendTransition({
		lotFolder: params.lotFolder,
		next: function failed({ last }) {
			return {
				at: params.now.toISOString(),
				// the folder's name is the lot's name (the folder rule): never a stray name a record carries
				lot: basename(params.lotFolder),
				state: 'failed',
				position: last?.position ?? { step: 0, of: 0, station: null, round: null },
				cause: { kind: params.kind, by: ENGINE, reason: params.reason },
				question: null,
				simulated: last?.simulated ?? false,
			}
		},
	})
}

/** A refused brief: `{ refused, next: null }` with `--json`, else one line per refusal `<field>: <rule> - <detail>`. */
function refusedOutput(params: { refused: readonly Refusal[]; json: boolean }): CommandResult {
	return {
		exitCode: 2,
		output: params.json
			? JSON.stringify({ refused: params.refused, next: null }, null, 2)
			: params.refused
					.map((refusal) => `${refusal.field}: ${refusal.rule} - ${refusal.detail}`)
					.join('\n'),
	}
}

/**
 * `--dry-run`: the checks passed, the lot the next index would name, its worktree and the real start to run next
 * (the brief path as given); nothing written or claimed.
 */
function dryRunOutput(params: {
	brief: CheckedBrief
	/** The brief path as the command was given it. */
	briefPath: string
	worktreesFolder: string
	json: boolean
}): CommandResult {
	const { brief } = params
	const lot = worktreeFolderName({
		index: nextWorktreeIndex({ worktreesFolder: params.worktreesFolder }),
		repository: brief.repository,
		branch: brief.branch,
	})
	const worktree = join(params.worktreesFolder, lot)
	const next = startNextOf(params.briefPath)
	if (params.json)
		return { exitCode: 0, output: JSON.stringify({ dryRun: true, lot, worktree, next }, null, 2) }
	return {
		exitCode: 0,
		output: [
			'checks: every check passed',
			`name: ${lot} (<next index>-${basename(brief.repository)}-${brief.branch.split('/').at(-1)}; no index claimed)`,
			`worktree: ${worktree}`,
			`next: ${next}`,
		].join('\n'),
	}
}

/** A lot started: its name, folder, worktree, runner and the manual next; the notes of what was not made (the link). */
function startedOutput(params: {
	name: string
	lotFolder: string
	worktree: string
	notes: string[]
	json: boolean
}): CommandResult {
	const next = manualNextOf(params.name)
	if (params.json)
		return {
			exitCode: 0,
			output: JSON.stringify(
				{
					lot: params.name,
					folder: params.lotFolder,
					worktree: params.worktree,
					runner: RUNNERS.manual,
					notes: params.notes,
					next,
				},
				null,
				2,
			),
		}
	return {
		exitCode: 0,
		output: [
			`${params.name} started`,
			`folder: ${params.lotFolder}`,
			`worktree: ${params.worktree}`,
			`runner: ${RUNNERS.manual}`,
			...params.notes.map((note) => `note: ${note}`),
			`next: ${next}`,
		].join('\n'),
	}
}
