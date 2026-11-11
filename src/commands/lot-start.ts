/**
 * `dialecte lot start <brief.json> [--effort low|medium|high] [--simulate <scenario>] [--dry-run] [--json]`: checks
 * the brief, claims an index, publishes the lot folder, makes the worktree and its link (33S section 5, `lot start`,
 * in order). A simulated start records the overlap and branch findings instead of refusing, copies the scenario
 * into the lot and makes no worktree, branch or link (33S section 8). Each step
 * is an exported function, so the race of two starts can be played in a forced order.
 */
import { linkSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { branchExists } from '../lib/git.ts'
import { registryOfCommonFolder } from '../lib/handover/handover-store-read.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { BRIEF_EFFORTS } from '../lib/store/brief.constants.ts'
import { checkBrief } from '../lib/store/brief.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { lotUsageExit } from '../lib/store/lot-exits.ts'
import {
	failedNextOf,
	manualNextOf,
	simulatedStartNextOf,
	startNextOf,
	waitNextOf,
} from '../lib/store/lot-next.ts'
import { overlapLotLabelOf, overlappingOpenLots, readLotScope } from '../lib/store/lot-records.ts'
import { recordText, removeDeadLeftovers, temporaryPidOf } from '../lib/store/publish.ts'
import { SCENARIO_SCHEMA, SCENARIOS } from '../lib/store/scenarios.constants.ts'
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
	START_USAGE_REASONS,
	START_VALUE_OPTIONS,
} from './lot-start.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { BriefEffort, CheckedBrief } from '../lib/store/brief.types.ts'
import type { ScenarioFile } from '../lib/store/scenarios.types.ts'
import type {
	LotIdentity,
	Refusal,
	SynchronousPause,
	Transition,
	TransitionCauseKind,
} from '../lib/store/store.types.ts'
import type {
	LinkFunction,
	LotWorktreeResult,
	Simulation,
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
	if (briefPath === undefined) return lotUsageExit({ reason: START_USAGE_REASONS.noBrief, json })
	if (extra.length > 0)
		return lotUsageExit({
			reason: START_USAGE_REASONS.extra.replace('{extra}', extra.join(' ')),
			json,
		})
	const effortFlag = read.values.get('effort')
	if (effortFlag !== undefined && !BRIEF_EFFORTS.includes(effortFlag as BriefEffort))
		return lotUsageExit({
			reason: START_USAGE_REASONS.effort
				.replace('{effort}', effortFlag)
				.replace('{efforts}', BRIEF_EFFORTS.join(', ')),
			json,
		})
	const seams = params.seams ?? {}
	const scenarioName = read.values.get('simulate')
	const simulation = scenarioName === undefined ? undefined : simulationOf({ scenarioName, seams })
	if (typeof simulation === 'string') return errorOutput({ exitCode: 2, message: simulation, json })
	const checked = checkBrief({
		briefPath,
		cwd: params.cwd,
		simulated: simulation !== undefined,
		pause: seams.pause,
	})
	if (!checked.checked) return refusedOutput({ refused: checked.refused, json })
	const brief = checked.checked
	const worktreesFolder = join(dirname(brief.repository), WORKTREES_FOLDER)
	// the store list is refused for a dry run too: it says what a real start would meet
	const listRefusal = storeListRefusal({})
	if (listRefusal) return errorOutput({ exitCode: 2, message: listRefusal, json })
	if (read.flags.has('dry-run'))
		return dryRunOutput({ brief, briefPath, worktreesFolder, simulation, json })
	try {
		return startChecked({
			brief,
			worktreesFolder,
			effort: effortOf({ flag: effortFlag as BriefEffort | undefined, brief }),
			json,
			now,
			seams,
			simulation,
		})
	} catch (error) {
		return thrownOutput({ error, json })
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
	/** What waits before the one re-read of a lot only `abandoned.json` marks canceled; blocks the thread by default. */
	pause?: SynchronousPause
}): string | undefined {
	return recheckedFailure(params)?.name
}

/**
 * `recheckOverlap` with the reason it published: the lot overlapped (a damaged one named with its damage, P2.2).
 */
function recheckedFailure(params: {
	lotFolder: string
	caseInsensitive: boolean
	now: Date
	pause?: SynchronousPause
}): { name: string; reason: string } | undefined {
	const store = dirname(params.lotFolder)
	const [overlap] = overlappingOpenLots({
		store,
		registry: registryOfCommonFolder(dirname(store)),
		scope: readLotScope({ lotFolder: params.lotFolder }),
		caseInsensitive: params.caseInsensitive,
		except: basename(params.lotFolder),
		pause: params.pause,
	})
	if (overlap === undefined) return undefined
	const reason = OVERLAP_REASON.replace('{lot}', overlapLotLabelOf(overlap))
	publishFailure({ lotFolder: params.lotFolder, kind: 'overlap', reason, now: params.now })
	return { name: overlap.name, reason }
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
	/** A simulated start: the scenario copied into the lot; no re-check, worktree, branch nor link. */
	simulation: Simulation | undefined
}): CommandResult {
	const { brief, now, seams, json, simulation } = params
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
		scenario: simulation && recordText(scenarioFileOf(simulation)),
		firstTransition: firstTransitionOf({
			name,
			steps: brief.steps.length,
			now,
			simulated: simulation !== undefined,
		}),
		identity: identityOf({
			brief,
			name,
			index,
			store,
			worktreesFolder: params.worktreesFolder,
			effort: params.effort,
			now,
			simulation,
		}),
	})
	if (!published)
		return errorOutput({
			exitCode: 1,
			message: `${lotFolder} exists already: the store is damaged, the index ${index} stays claimed`,
			json,
		})
	// a simulated lot holds no lock and no branch: never re-checked, no worktree made
	if (simulation) return startedOutput({ name, lotFolder, worktree: null, notes: [], json })
	try {
		return startPublished({ name, lotFolder, brief, now, seams, json })
	} catch (error) {
		// the lot exists from here on: the exit names it
		return thrownOutput({ error, json, lot: name })
	}
}

/** The start of a published real lot: the race re-check, then the worktree and its link. */
function startPublished(params: {
	name: string
	lotFolder: string
	brief: CheckedBrief
	now: Date
	seams: StartSeams
	json: boolean
}): CommandResult {
	const { name, lotFolder, brief, now, seams, json } = params
	const overlap = recheckedFailure({
		lotFolder,
		caseInsensitive: brief.caseInsensitive,
		now,
		pause: seams.pause,
	})
	if (overlap) return failedOutput({ name, lotFolder, reason: overlap.reason, json })
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

/**
 * An exit before any lot exists (or a step that broke): the message, and no next command; once the lot folder
 * exists, the lot it happened to (`lot` in the JSON, `lot start: <lot>: <message>` as text).
 */
function errorOutput(params: {
	exitCode: number
	message: string
	json: boolean
	lot?: string
}): CommandResult {
	const { lot } = params
	return {
		exitCode: params.exitCode,
		output: params.json
			? jsonOf({ error: params.message, ...(lot !== undefined && { lot }), next: null }, 2)
			: textOf([`lot start: ${lot === undefined ? '' : `${lot}: `}${params.message}`]),
	}
}

/** The exit of an error thrown during a start: exit 2 for a store refusal, else 1; the lot when it exists. */
function thrownOutput(params: { error: unknown; json: boolean; lot?: string }): CommandResult {
	const error = params.error as Error
	return errorOutput({
		exitCode: error.name === STORE_REFUSAL ? 2 : 1,
		message: error.message,
		json: params.json,
		lot: params.lot,
	})
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
			output: jsonOf(
				{
					lot: params.name,
					folder: params.lotFolder,
					state: 'failed',
					reason: params.reason,
					next,
				},
				2,
			),
		}
	return resultOf({
		exitCode: 1,
		lines: [
			`${params.name} failed: ${params.reason}`,
			`folder: ${params.lotFolder}`,
			`next: ${next}`,
		],
	})
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
function firstTransitionOf(params: {
	name: string
	steps: number
	now: Date
	simulated: boolean
}): Transition {
	return {
		seq: 1,
		at: params.now.toISOString(),
		lot: params.name,
		state: 'working',
		position: { step: 0, of: params.steps, station: null, round: null },
		cause: { kind: 'start', by: ENGINE, reason: START_REASON },
		question: null,
		simulated: params.simulated,
	}
}

/**
 * The scenario `--simulate <name>` names in the table (the built-in one unless a seam gives another), or why it is
 * refused: an unknown name, the names listed.
 */
function simulationOf(params: { scenarioName: string; seams: StartSeams }): Simulation | string {
	const table = params.seams.scenarios ?? SCENARIOS
	const { scenarioName } = params
	if (!Object.hasOwn(table, scenarioName))
		return `no scenario ${scenarioName}: --simulate takes one of ${Object.keys(table).sort().join(', ')}`
	return { name: scenarioName, steps: table[scenarioName] }
}

/** `scenario.json`: the scenario's steps as the table holds them, so `wait` plays the lot's own copy. */
function scenarioFileOf(simulation: Simulation): ScenarioFile {
	return { schema: SCENARIO_SCHEMA, name: simulation.name, steps: simulation.steps }
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
	simulation: Simulation | undefined
}): LotIdentity {
	const { brief, simulation } = params
	return {
		schema: IDENTITY_SCHEMA,
		name: params.name,
		index: params.index,
		repository: brief.repository,
		store: params.store,
		worktree: simulation ? null : join(params.worktreesFolder, params.name),
		branch: brief.branch,
		base: brief.base,
		feature: brief.feature,
		effort: params.effort,
		simulated: simulation !== undefined,
		scenario: simulation?.name ?? null,
		// a real lot holds no such key: it was refused for what a simulated one records here
		...(simulation ? { wouldRefuse: brief.wouldRefuse } : {}),
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
			? jsonOf({ refused: params.refused, next: null }, 2)
			: textOf(params.refused.map(refusalLineOf)),
	}
}

/** A finding of the brief checks as a line: `<field>: <rule> - <detail>`. */
function refusalLineOf(refusal: Refusal): string {
	return `${refusal.field}: ${refusal.rule} - ${refusal.detail}`
}

/**
 * `--dry-run`: the lot the next index would name and the start to run next (the brief path as given); nothing
 * written or claimed. A real dry run: the checks passed, its worktree, the real start. A simulated one (G6): the
 * findings a real start would refuse for (`wouldRefuse`), no worktree, the same simulated start.
 */
function dryRunOutput(params: {
	brief: CheckedBrief
	/** The brief path as the command was given it. */
	briefPath: string
	worktreesFolder: string
	simulation: Simulation | undefined
	json: boolean
}): CommandResult {
	const { brief, simulation } = params
	const lot = worktreeFolderName({
		index: nextWorktreeIndex({ worktreesFolder: params.worktreesFolder }),
		repository: brief.repository,
		branch: brief.branch,
	})
	const lotLine = `lot: ${lot} (<next index>-${basename(brief.repository)}-${brief.branch.split('/').at(-1)}; no index claimed)`
	if (simulation !== undefined) {
		const next = simulatedStartNextOf({ briefPath: params.briefPath, scenario: simulation.name })
		const { wouldRefuse } = brief
		if (params.json)
			return {
				exitCode: 0,
				output: jsonOf({ dryRun: true, lot, worktree: null, wouldRefuse, next }, 2),
			}
		return resultOf({
			exitCode: 0,
			lines: [
				...(wouldRefuse.length === 0
					? ['checks: every check passed']
					: [
							`checks: ${wouldRefuse.length} a real start would refuse for (wouldRefuse)`,
							...wouldRefuse.map(refusalLineOf),
						]),
				lotLine,
				'worktree: none (simulated)',
				`next: ${next}`,
			],
		})
	}
	const worktree = join(params.worktreesFolder, lot)
	const next = startNextOf(params.briefPath)
	if (params.json) return { exitCode: 0, output: jsonOf({ dryRun: true, lot, worktree, next }, 2) }
	return resultOf({
		exitCode: 0,
		lines: ['checks: every check passed', lotLine, `worktree: ${worktree}`, `next: ${next}`],
	})
}

/**
 * A lot started: its name, folder, worktree, runner and next; the notes of what was not made (the link). A
 * simulated lot (no worktree): runner simulated, next the wait line.
 */
function startedOutput(params: {
	name: string
	lotFolder: string
	worktree: string | null
	notes: string[]
	json: boolean
}): CommandResult {
	const simulated = params.worktree === null
	const runner = simulated ? RUNNERS.simulated : RUNNERS.manual
	const next = simulated ? waitNextOf({ name: params.name, simulated }) : manualNextOf(params.name)
	if (params.json)
		return {
			exitCode: 0,
			output: jsonOf(
				{
					lot: params.name,
					folder: params.lotFolder,
					worktree: params.worktree,
					runner,
					notes: params.notes,
					next,
				},
				2,
			),
		}
	return resultOf({
		exitCode: 0,
		lines: [
			`${params.name} started`,
			`folder: ${params.lotFolder}`,
			`worktree: ${params.worktree ?? 'none (simulated)'}`,
			`runner: ${runner}`,
			...params.notes.map((note) => `note: ${note}`),
			`next: ${next}`,
		],
	})
}
