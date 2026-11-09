/** The brief of a lot: the field checks (pure), and the whole check against the repository, the plan and the store. */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { branchExists, mainCheckoutOf, readGit } from '../git.ts'
import { findWorkspace } from '../workspace.ts'
import {
	coversEntry,
	isInsideEntry,
	literalPartOf,
	normaliseScopeEntry,
	scopeFaultOf,
} from './brief-scope.ts'
import {
	BEHAVIOUR_ARROW,
	BEHAVIOURS_MAX,
	BEHAVIOURS_MIN,
	BRIEF_EFFORTS,
	BRIEF_HASH_ALGORITHM,
	BRIEF_KEYS,
	BRIEF_SCHEMA,
	CURRENT_SEGMENT,
	FEATURE_MAX_LENGTH,
	FEATURE_PATTERN,
	GOAL_MAX_LENGTH,
	HEADING_LINE_PATTERN,
	LINE_BREAK_PATTERN,
	PARENT_SEGMENT,
	PLAN_LINE_SEPARATOR,
	REFUSED_BRANCH_NAMES,
	SCOPE_SEPARATOR,
	WHOLE_BRIEF_FIELD,
} from './brief.constants.ts'
import { overlappingOpenLots, readLotStateInput } from './lot-records.ts'
import { listLotNames, locateStore } from './store-folder.ts'
import { SIMULATED_FINDING_RULES } from './store.constants.ts'

import type {
	BriefEffort,
	BriefFieldsResult,
	BriefLot,
	BriefStep,
	CheckBriefResult,
} from './brief.types.ts'
import type {
	LotIdentity,
	Refusal,
	RefusalRule,
	StoreLocation,
	SynchronousPause,
} from './store.types.ts'

/**
 * The checks that need no file system and no git: `shape`, `scope`, `behaviour`, `lots-outside-scope`,
 * `scope-not-covered`. Every refusal is returned, not the first.
 */
export function checkBriefFields(params: { value: unknown }): BriefFieldsResult {
	const { value } = params
	if (!isRecord(value))
		return {
			refused: [
				refusalOf({
					field: WHOLE_BRIEF_FIELD,
					rule: 'shape',
					detail: 'the brief is no JSON object',
				}),
			],
			brief: undefined,
		}
	const scope = scopeEntriesOf(value.scope)
	const lots = lotsOf(value.lots)
	const refused = [
		...unknownKeyFaults(value),
		...schemaFaults(value.schema),
		...featureFaults(value.feature),
		...['repository', 'branch', 'base', 'plan'].flatMap((field) =>
			textFaults({ field, value: value[field] }),
		),
		...textFaults({ field: 'goal', value: value.goal, oneLine: true, maxLength: GOAL_MAX_LENGTH }),
		...effortFaults(value.effort),
		...stepFaults(value.steps),
		...scope.refused,
		...lots.refused,
		...lotScopeFaults({ scope: scope.entries, lots: lots.lots }),
	]
	if (refused.length > 0) return { refused, brief: undefined }
	return {
		refused,
		brief: {
			schema: BRIEF_SCHEMA,
			feature: value.feature as string,
			repository: value.repository as string,
			branch: value.branch as string,
			base: value.base as string,
			goal: value.goal as string,
			plan: value.plan as string,
			scope: scope.entries ?? [],
			steps: value.steps as BriefStep[],
			lots: lots.lots ?? [],
			effort: value.effort as BriefEffort | undefined,
		},
	}
}

/**
 * Reads the brief file and runs every check (33S section 5): the fields, the repository (its main checkout), the
 * branch, the base, the plan and its headings, the overlap with the open real lots of the repository's store.
 * Creates nothing. A check a shape fault makes impossible is skipped, every other runs. For a simulated start the
 * overlap and branch findings are returned in `wouldRefuse` and refuse nothing (33S section 5).
 */
export function checkBrief(params: {
	briefPath: string
	cwd?: string
	/** Injected instead of probed (D11). */
	caseInsensitive?: boolean
	/** A simulated start: the overlap and branch findings go to `wouldRefuse`. */
	simulated?: boolean
	/** What waits before the one re-read of a lot only `abandoned.json` marks canceled; blocks the thread by default. */
	pause?: SynchronousPause
}): CheckBriefResult {
	const briefPath = resolve(params.cwd ?? process.cwd(), params.briefPath)
	const briefFolder = dirname(briefPath)
	const read = readBriefFile(briefPath)
	if (read.refusal) return { refused: [read.refusal], checked: undefined }
	const { value, text, bytes } = read
	const fields = checkBriefFields({ value })
	if (!isRecord(value)) return { refused: fields.refused, checked: undefined }
	const repository = resolveRepository({ value: value.repository, briefFolder })
	const location = repository.main ? locateStore({ from: repository.main }) : undefined
	const branch = branchFaults({
		value: value.branch,
		repository: repository.main,
		location,
		briefFolder,
	})
	const base = resolveBase({ value: value.base, repository: repository.main })
	const plan = readPlan({ value: value.plan, briefFolder })
	const caseInsensitive =
		params.caseInsensitive ??
		(repository.main !== undefined && probeCaseInsensitive({ path: repository.main }))
	const faults = [
		...fields.refused,
		...repository.refused,
		...branch,
		...base.refused,
		...plan.refused,
		...specHeadingFaults({ steps: value.steps, planText: plan.text }),
		...overlapFaults({ brief: value, location, caseInsensitive, pause: params.pause }),
	]
	const findings = params.simulated
		? faults.filter((fault) => SIMULATED_FINDING_RULES.includes(fault.rule))
		: []
	const refused = faults.filter((fault) => !findings.includes(fault))
	const { brief } = fields
	if (
		refused.length > 0 ||
		!brief ||
		!repository.main ||
		!base.commit ||
		plan.text === undefined ||
		plan.bytes === undefined
	)
		return { refused, checked: undefined }
	return {
		refused,
		checked: {
			repository: repository.main,
			base: { ref: brief.base, commit: base.commit },
			branch: brief.branch,
			feature: brief.feature,
			goal: brief.goal,
			plan: { text: plan.text, bytes: plan.bytes, hash: hashOf(plan.bytes) },
			briefText: text,
			briefBytes: bytes,
			briefHash: hashOf(bytes),
			scope: brief.scope,
			steps: brief.steps,
			lots: brief.lots,
			effort: brief.effort,
			caseInsensitive,
			wouldRefuse: findings,
		},
	}
}

/**
 * Whether the volume of `path` is case-insensitive: `stat` of the path with its last segment's case swapped finds
 * the same inode and device (D11).
 */
export function probeCaseInsensitive(params: { path: string }): boolean {
	const swapped = join(dirname(params.path), swapCase(basename(params.path)))
	if (swapped === params.path) return false
	try {
		const [original, other] = [statSync(params.path), statSync(swapped)]
		return original.ino === other.ino && original.dev === other.dev
	} catch {
		return false
	}
}

function refusalOf(params: { field: string; rule: RefusalRule; detail: string }): Refusal {
	return { field: params.field, rule: params.rule, detail: params.detail }
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyArray(value: unknown): value is unknown[] {
	return Array.isArray(value) && value.length > 0
}

function isOneLineText(value: unknown): value is string {
	return typeof value === 'string' && value !== '' && !LINE_BREAK_PATTERN.test(value)
}

function unknownKeyFaults(value: Record<string, unknown>): Refusal[] {
	return Object.keys(value)
		.filter((key) => !BRIEF_KEYS.includes(key))
		.map((key) =>
			refusalOf({ field: key, rule: 'shape', detail: `${key} is not a key of a brief` }),
		)
}

function schemaFaults(value: unknown): Refusal[] {
	if (value === BRIEF_SCHEMA) return []
	return [refusalOf({ field: 'schema', rule: 'shape', detail: `schema must be ${BRIEF_SCHEMA}` })]
}

function featureFaults(value: unknown): Refusal[] {
	if (
		typeof value === 'string' &&
		FEATURE_PATTERN.test(value) &&
		value.length <= FEATURE_MAX_LENGTH
	)
		return []
	return [
		refusalOf({
			field: 'feature',
			rule: 'shape',
			detail: `feature must be lower-case letters, digits and dashes, not starting with a dash, at most ${FEATURE_MAX_LENGTH}`,
		}),
	]
}

/** A required text field: a non-empty string; one line and at most `maxLength` when asked. */
function textFaults(params: {
	field: string
	value: unknown
	oneLine?: boolean
	maxLength?: number
}): Refusal[] {
	const { field, value } = params
	if (typeof value !== 'string' || value === '')
		return [refusalOf({ field, rule: 'shape', detail: `${field} must be a non-empty string` })]
	if (params.oneLine && LINE_BREAK_PATTERN.test(value))
		return [refusalOf({ field, rule: 'shape', detail: `${field} must be one line` })]
	if (params.maxLength !== undefined && value.length > params.maxLength)
		return [
			refusalOf({
				field,
				rule: 'shape',
				detail: `${field} must be at most ${params.maxLength} characters`,
			}),
		]
	return []
}

function effortFaults(value: unknown): Refusal[] {
	if (value === undefined || BRIEF_EFFORTS.includes(value as BriefEffort)) return []
	return [
		refusalOf({
			field: 'effort',
			rule: 'shape',
			detail: `effort must be one of ${BRIEF_EFFORTS.join(', ')}`,
		}),
	]
}

function stepFaults(value: unknown): Refusal[] {
	if (!isNonEmptyArray(value))
		return [refusalOf({ field: 'steps', rule: 'shape', detail: 'steps must be a non-empty array' })]
	return value.flatMap(function faultsOfStep(step, index): Refusal[] {
		const field = `steps[${index}]`
		if (!isRecord(step))
			return [refusalOf({ field, rule: 'shape', detail: `${field} must be an object` })]
		if (!isOneLineText(step.title) || typeof step.spec !== 'string' || step.spec === '')
			return [
				refusalOf({
					field,
					rule: 'shape',
					detail: `${field} must hold a one-line title and a spec heading`,
				}),
			]
		return behaviourFaults({ field: `${field}.behaviours`, value: step.behaviours })
	})
}

function behaviourFaults(params: { field: string; value: unknown }): Refusal[] {
	const { field, value } = params
	if (!Array.isArray(value) || value.some((behaviour) => typeof behaviour !== 'string'))
		return [refusalOf({ field, rule: 'shape', detail: `${field} must be an array of strings` })]
	if (value.length < BEHAVIOURS_MIN || value.length > BEHAVIOURS_MAX)
		return [
			refusalOf({
				field,
				rule: 'behaviour',
				detail: `a step holds ${BEHAVIOURS_MIN} to ${BEHAVIOURS_MAX} behaviours, not ${value.length}`,
			}),
		]
	return (value as string[]).flatMap(function faultOfBehaviour(behaviour, index): Refusal[] {
		const sides = behaviour.split(BEHAVIOUR_ARROW)
		if (sides.length === 2 && sides.every((side) => side.trim() !== '')) return []
		return [
			refusalOf({
				field: `${field}[${index}]`,
				rule: 'behaviour',
				detail: `"${behaviour}" must hold exactly one "${BEHAVIOUR_ARROW.trim()}" with text on both sides`,
			}),
		]
	})
}

/**
 * The scope's shape and its entries' faults; `entries` (normalised, the refused ones left out) only when the shape
 * holds, so the lot checks never run on a broken scope.
 */
function scopeEntriesOf(value: unknown): { refused: Refusal[]; entries: string[] | undefined } {
	if (!isNonEmptyArray(value) || value.some((entry) => typeof entry !== 'string'))
		return {
			refused: [
				refusalOf({
					field: 'scope',
					rule: 'shape',
					detail: 'scope must be a non-empty array of paths or globs',
				}),
			],
			entries: undefined,
		}
	const refused: Refusal[] = []
	const entries: string[] = []
	for (const [index, entry] of (value as string[]).entries()) {
		const fault = scopeFaultOf({ entry })
		if (fault) refused.push(refusalOf({ field: `scope[${index}]`, rule: 'scope', detail: fault }))
		else entries.push(normaliseScopeEntry(entry))
	}
	return { refused, entries }
}

/** The lots' shape; `lots` (paths normalised) only when it holds. */
function lotsOf(value: unknown): { refused: Refusal[]; lots: BriefLot[] | undefined } {
	if (!isNonEmptyArray(value))
		return {
			refused: [
				refusalOf({ field: 'lots', rule: 'shape', detail: 'lots must be a non-empty array' }),
			],
			lots: undefined,
		}
	const refused = value.flatMap(function faultsOfLot(lot, index): Refusal[] {
		const field = `lots[${index}]`
		if (!isRecord(lot) || !isOneLineText(lot.message))
			return [
				refusalOf({
					field,
					rule: 'shape',
					detail: `${field} must be an object with a one-line message`,
				}),
			]
		if (!isNonEmptyArray(lot.paths) || lot.paths.some((path) => typeof path !== 'string'))
			return [
				refusalOf({
					field: `${field}.paths`,
					rule: 'shape',
					detail: `${field}.paths must be a non-empty array of paths`,
				}),
			]
		return (lot.paths as string[])
			.filter((path) => literalPartOf(path) !== path)
			.map((path) =>
				refusalOf({
					field: `${field}.paths`,
					rule: 'shape',
					detail: `${path} holds a glob: a lot's paths are literal`,
				}),
			)
	})
	if (refused.length > 0) return { refused, lots: undefined }
	return {
		refused,
		lots: (value as BriefLot[]).map((lot) => ({
			paths: lot.paths.map(normaliseScopeEntry),
			message: lot.message,
		})),
	}
}

/** Each lot path inside a scope entry, every scope entry covered by a lot path. */
function lotScopeFaults(params: {
	scope: string[] | undefined
	lots: BriefLot[] | undefined
}): Refusal[] {
	const { scope, lots } = params
	if (!scope || !lots) return []
	const outside = lots.flatMap((lot, index) =>
		lot.paths
			.filter(
				(path) =>
					scopeFaultOf({ entry: path }) !== undefined ||
					!scope.some((entry) => isInsideEntry({ path, entry })),
			)
			.map((path) =>
				refusalOf({
					field: `lots[${index}].paths`,
					rule: 'lots-outside-scope',
					detail: `${path} is inside no scope entry`,
				}),
			),
	)
	const paths = lots.flatMap((lot) => lot.paths)
	const uncovered = scope
		.filter((entry) => !paths.some((path) => coversEntry({ path, entry })))
		.map((entry) =>
			refusalOf({
				field: 'scope',
				rule: 'scope-not-covered',
				detail: `no lot path covers the scope entry ${entry}`,
			}),
		)
	return [...outside, ...uncovered]
}

/** The brief file parsed, or the `shape` refusal of a file that cannot be read or does not parse. */
function readBriefFile(
	path: string,
): { value: unknown; text: string; bytes: Buffer; refusal?: undefined } | { refusal: Refusal } {
	let bytes: Buffer
	try {
		bytes = readFileSync(path)
	} catch (error) {
		return {
			refusal: refusalOf({
				field: WHOLE_BRIEF_FIELD,
				rule: 'shape',
				detail: `${path} cannot be read: ${(error as Error).message}`,
			}),
		}
	}
	const text = bytes.toString('utf8')
	try {
		return { value: JSON.parse(text) as unknown, text, bytes }
	} catch (error) {
		return {
			refusal: refusalOf({
				field: WHOLE_BRIEF_FIELD,
				rule: 'shape',
				detail: `${path} is not JSON: ${(error as Error).message}`,
			}),
		}
	}
}

/**
 * The main checkout (real path) the brief's repository names: a path form (absolute, or starting with `.`/`..`)
 * against the brief file's folder; else a name in the workspace of the brief folder, or beside the brief folder's
 * repository when there is no workspace (D10). Skipped (nothing refused here) when the field has no text.
 */
function resolveRepository(params: { value: unknown; briefFolder: string }): {
	refused: Refusal[]
	main: string | undefined
} {
	const { value, briefFolder } = params
	if (typeof value !== 'string' || value === '') return { refused: [], main: undefined }
	const candidate = isPathForm(value)
		? resolve(briefFolder, value)
		: namedRepositoryOf({ name: value, briefFolder })
	const main =
		candidate === undefined ? undefined : mainCheckoutAt({ folder: candidate, topLevelOnly: true })
	if (main) return { refused: [], main }
	return {
		refused: [
			refusalOf({
				field: 'repository',
				rule: 'repository',
				detail: `${value} is not a git repository${candidate ? ` (${candidate})` : ''}`,
			}),
		],
		main: undefined,
	}
}

/** Absolute, or `.`, `..` or starting with `./` or `../`: a path, not a name. */
function isPathForm(value: string): boolean {
	const first = value.split(SCOPE_SEPARATOR)[0]
	return isAbsolute(value) || first === CURRENT_SEGMENT || first === PARENT_SEGMENT
}

/** `<workspace>/<name>`, or without a workspace the name beside the brief folder's repository. */
function namedRepositoryOf(params: { name: string; briefFolder: string }): string | undefined {
	const workspace = findWorkspace(params.briefFolder)
	if (workspace) return join(workspace, params.name)
	const host = mainCheckoutAt({ folder: params.briefFolder, topLevelOnly: false })
	return host ? join(dirname(host), params.name) : undefined
}

/**
 * The real path of the main checkout of the repository at `folder`; undefined when `folder` is no repository's top
 * (or, with `topLevelOnly: false`, in no repository).
 */
function mainCheckoutAt(params: { folder: string; topLevelOnly: boolean }): string | undefined {
	try {
		const top = readGit({ root: params.folder, args: ['rev-parse', '--show-toplevel'] }).trim()
		if (params.topLevelOnly && realPathOf(top) !== realPathOf(params.folder)) return undefined
		return realPathOf(mainCheckoutOf(top))
	} catch {
		return undefined
	}
}

/** The branch well formed, and absent as a ref of the repository (the real lots naming it named). */
function branchFaults(params: {
	value: unknown
	repository: string | undefined
	location: StoreLocation | undefined
	briefFolder: string
}): Refusal[] {
	const { value, repository } = params
	if (typeof value !== 'string' || value === '') return []
	if (!isBranchName({ name: value, root: repository ?? params.briefFolder }))
		return [
			refusalOf({
				field: 'branch',
				rule: 'branch-name',
				detail: `${value} is not a valid branch name`,
			}),
		]
	if (!repository || !branchExists({ root: repository, branch: value })) return []
	const holders = realLotIdentities(params.location)
		.filter((identity) => identity.branch === value)
		.map((identity) => identity.name)
	return [
		refusalOf({
			field: 'branch',
			rule: 'branch-exists',
			detail: `the branch ${value} exists${holders.length > 0 ? `; the lot ${holders.join(', ')} holds it` : ''}`,
		}),
	]
}

function isBranchName(params: { name: string; root: string }): boolean {
	if (REFUSED_BRANCH_NAMES.includes(params.name)) return false
	try {
		readGit({ root: params.root, args: ['check-ref-format', '--branch', params.name] })
		return true
	} catch {
		return false
	}
}

/** The base's commit; skipped when the repository or the base is unknown. */
function resolveBase(params: { value: unknown; repository: string | undefined }): {
	refused: Refusal[]
	commit: string | undefined
} {
	const { value, repository } = params
	if (typeof value !== 'string' || value === '' || !repository)
		return { refused: [], commit: undefined }
	try {
		const commit = readGit({
			root: repository,
			args: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${value}^{commit}`],
		}).trim()
		return { refused: [], commit }
	} catch {
		return {
			refused: [
				refusalOf({ field: 'base', rule: 'base', detail: `${value} resolves to no commit` }),
			],
			commit: undefined,
		}
	}
}

/** The plan file read (path against the brief file's folder); skipped when the field has no text. */
function readPlan(params: { value: unknown; briefFolder: string }): {
	refused: Refusal[]
	text: string | undefined
	bytes: Buffer | undefined
} {
	const { value } = params
	if (typeof value !== 'string' || value === '')
		return { refused: [], text: undefined, bytes: undefined }
	const path = resolve(params.briefFolder, value)
	try {
		const bytes = readFileSync(path)
		return { refused: [], text: bytes.toString('utf8'), bytes }
	} catch (error) {
		return {
			refused: [
				refusalOf({
					field: 'plan',
					rule: 'plan',
					detail: `${path} cannot be read: ${(error as Error).message}`,
				}),
			],
			text: undefined,
			bytes: undefined,
		}
	}
}

/** Each step's `spec` a heading line of the plan, exactly; skipped without a plan. */
function specHeadingFaults(params: { steps: unknown; planText: string | undefined }): Refusal[] {
	const { steps, planText } = params
	if (planText === undefined || !Array.isArray(steps)) return []
	const headings = new Set(
		planText.split(PLAN_LINE_SEPARATOR).filter((line) => HEADING_LINE_PATTERN.test(line)),
	)
	return steps.flatMap(function faultOfStep(step, index): Refusal[] {
		if (!isRecord(step) || typeof step.spec !== 'string' || headings.has(step.spec)) return []
		return [
			refusalOf({
				field: `steps[${index}].spec`,
				rule: 'spec-heading',
				detail: `"${step.spec}" is no heading line of the plan`,
			}),
		]
	})
}

/** The identities of the real (not simulated) lots of the store. */
function realLotIdentities(location: StoreLocation | undefined): LotIdentity[] {
	if (!location) return []
	return listLotNames({ store: location.store }).flatMap(function identityOf(name): LotIdentity[] {
		const input = readLotStateInput({
			lotFolder: join(location.store, name),
			registry: location.registry,
		})
		return input && !input.identity.simulated ? [input.identity] : []
	})
}

/**
 * One `overlap` refusal per open real lot of the store a scope entry of the brief overlaps (D12: not committed, not
 * canceled, not simulated, not failed by an overlap). Skipped when the scope's shape fails; refused entries are left
 * out.
 */
function overlapFaults(params: {
	brief: Record<string, unknown>
	location: StoreLocation | undefined
	caseInsensitive: boolean
	pause: SynchronousPause | undefined
}): Refusal[] {
	const { location } = params
	const { entries } = scopeEntriesOf(params.brief.scope)
	if (!location || !entries) return []
	return overlappingOpenLots({
		store: location.store,
		registry: location.registry,
		scope: entries,
		caseInsensitive: params.caseInsensitive,
		pause: params.pause,
	}).map((overlap) =>
		refusalOf({
			field: 'scope',
			rule: 'overlap',
			detail: `overlap with ${overlap.name}: ${overlap.met.join('; ')}`,
		}),
	)
}

function hashOf(bytes: Buffer): string {
	return createHash(BRIEF_HASH_ALGORITHM).update(bytes).digest('hex')
}

function swapCase(text: string): string {
	return [...text]
		.map((letter) =>
			letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase(),
		)
		.join('')
}
