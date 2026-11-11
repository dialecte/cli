/**
 * The lot block of a plan: found (one fenced block, or the file beside the plan), parsed with every fault listed at
 * once, then its repositories checked.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { isPresent } from '../file-system.ts'
import { normaliseScopeEntry, scopeFaultOf } from '../store/brief-scope.ts'
import { GLOB_CHARACTER_PATTERN } from '../store/brief.constants.ts'
import { checkPlanRepositories } from './check-plan-block.ts'
import { orderFaultsOf } from './plan-block-order.ts'
import {
	FENCE_LINE_PATTERN,
	LINE_BREAK_PATTERN,
	PLAN_BLOCK_KEYS,
	PLAN_ENTRY_KEYS,
	PLAN_ENTRY_KINDS,
	PLAN_EXTENSION,
	PLAN_FENCE_INFO,
	PLAN_HEAVY_KINDS,
	PLAN_ID_MAX_LENGTH,
	PLAN_ID_PATTERN,
	PLAN_MATCH_KEYS,
	PLAN_REPOSITORY_KINDS,
	PLAN_UNIQUE_MATCH_KEYS,
	PLAN_SCHEMA,
	PLAN_TITLE_MAX_LENGTH,
	SIDECAR_SUFFIX,
	WHOLE_REPOSITORY_ENTRY,
	WHOLE_REPOSITORY_PATTERN,
} from './plan.constants.ts'

import type {
	PlanBlock,
	PlanBlockRead,
	PlanBlockSource,
	PlanEntry,
	PlanEntryKind,
	PlanFault,
	PlanHeavyKind,
} from './plan-block.types.ts'
import type { PlanEntryContext, PlanOrderNode, PlanParsed } from './plan.types.ts'

/**
 * The lot block of a plan: the one `json dialecte-lots` fence, or the `<plan without .md>.lots.json` sidecar (both
 * or neither is a fault); parsed, then its repositories checked.
 */
export function readPlanBlock(params: { planPath: string }): PlanBlockRead {
	const planPath = resolve(params.planPath)
	const located = locateBlockText({ planPath })
	if ('faults' in located) return located
	const value = parsedJsonOf({ text: located.text, path: located.source.path })
	if ('faults' in value) return value
	const planFolder = dirname(planPath)
	const parsed = parsePlanBlock({ value: value.json, planFolder })
	if (parsed.block === undefined)
		return {
			faults: [...parsed.faults, ...readableRepositoryFaultsOf({ value: value.json, planFolder })],
		}
	const repositoryFaults = checkPlanRepositories({ block: parsed.block })
	if (repositoryFaults.length > 0) return { faults: repositoryFaults }
	return { block: parsed.block, source: located.source }
}

/** The block of a parsed JSON value, paths resolved against `planFolder`; every fault listed at once. Pure. */
export function parsePlanBlock(params: { value: unknown; planFolder: string }): {
	block?: PlanBlock
	faults: PlanFault[]
} {
	const { value, planFolder } = params
	if (!isRecord(value))
		return { faults: [{ at: 'block', detail: 'the lot block is not a JSON object' }] }
	const repositories = parseRepositories({ value: value.repositories, planFolder })
	const names = Object.keys(repositories.value ?? {})
	const shared = parseShared({ value: value.shared, repositories: names })
	const lots = parseLots({ value: value.lots, planFolder, repositories: names })
	const faults = [
		...unknownKeyFaults({ value, keys: PLAN_BLOCK_KEYS, at: '' }),
		...(value.schema === PLAN_SCHEMA
			? []
			: [
					{
						at: 'schema',
						detail: `schema is ${String(value.schema)}: this cli reads schema ${PLAN_SCHEMA}`,
					},
				]),
		...repositories.faults,
		...shared.faults,
		...lots.faults,
	]
	if (
		faults.length > 0 ||
		repositories.value === undefined ||
		shared.value === undefined ||
		lots.value === undefined
	)
		return { faults }
	return {
		block: {
			schema: PLAN_SCHEMA,
			repositories: repositories.value,
			shared: shared.value,
			lots: lots.value,
		},
		faults: [],
	}
}

/** The text of the block and where it is: the one fence of the plan, or its sidecar; a fault for both, neither, two fences. */
function locateBlockText(params: {
	planPath: string
}): { text: string; source: PlanBlockSource } | { faults: PlanFault[] } {
	const { planPath } = params
	const plan = readTextOf({ path: planPath })
	if (plan === undefined)
		return { faults: [{ at: 'block', detail: `the plan ${planPath} cannot be read` }] }
	const fences = dialecteFencesOf({ text: plan })
	const sidecar = sidecarPathOf({ planPath })
	const hasSidecar = isPresent(sidecar)
	if (fences.length > 1)
		return {
			faults: [
				{
					at: 'block',
					detail: `${planPath} holds ${fences.length} \`${PLAN_FENCE_INFO}\` fences: a plan holds one`,
				},
			],
		}
	if (fences.length === 1 && hasSidecar)
		return {
			faults: [
				{
					at: 'block',
					detail: `both a \`${PLAN_FENCE_INFO}\` fence in ${planPath} and the sidecar ${sidecar}: keep one`,
				},
			],
		}
	if (fences.length === 1) return { text: fences[0], source: { kind: 'fence', path: planPath } }
	const sidecarText = hasSidecar ? readTextOf({ path: sidecar }) : undefined
	if (sidecarText !== undefined)
		return { text: sidecarText, source: { kind: 'sidecar', path: sidecar } }
	return {
		faults: [
			{
				at: 'block',
				detail: `${planPath} holds no lot block: a \`${PLAN_FENCE_INFO}\` fence in the plan, or the file ${sidecar} (\`<plan without ${PLAN_EXTENSION}>${SIDECAR_SUFFIX}\`)`,
			},
		],
	}
}

/** The bodies of the plan's fences whose info string is the block's, in order; other fences are skipped whole. */
function dialecteFencesOf(params: { text: string }): string[] {
	const bodies: string[] = []
	let open: { marker: string; info: string; body: string[] } | undefined
	for (const line of params.text.split(/\r?\n/)) {
		const fence = FENCE_LINE_PATTERN.exec(line)
		if (open === undefined) {
			if (fence !== null) open = { marker: fence[1], info: fence[2].trim(), body: [] }
		} else if (fence !== null && fence[2].trim() === '' && fence[1].length >= open.marker.length) {
			if (open.info === PLAN_FENCE_INFO) bodies.push(open.body.join('\n'))
			open = undefined
		} else open.body.push(line)
	}
	return bodies
}

/** The file beside the plan that may hold its block: `<plan without .md>.lots.json`. */
function sidecarPathOf(params: { planPath: string }): string {
	const { planPath } = params
	const base = planPath.endsWith(PLAN_EXTENSION)
		? planPath.slice(0, -PLAN_EXTENSION.length)
		: planPath
	return `${base}${SIDECAR_SUFFIX}`
}

/** The text of a file, undefined when it cannot be read. */
function readTextOf(params: { path: string }): string | undefined {
	try {
		return readFileSync(params.path, 'utf8')
	} catch {
		return undefined
	}
}

/** The JSON value of the block's text, or the fault saying it is not JSON. */
function parsedJsonOf(params: {
	text: string
	path: string
}): { json: unknown } | { faults: PlanFault[] } {
	try {
		return { json: JSON.parse(params.text) }
	} catch (error) {
		return {
			faults: [
				{
					at: 'block',
					detail: `the lot block of ${params.path} is not JSON: ${(error as Error).message}`,
				},
			],
		}
	}
}

/** `repositories`: name -> path, resolved against the plan's folder. */
/**
 * The repository faults of a block refused for another field, when its repositories parse: every fault of the
 * block is listed at once, the repositories' with the entries'.
 */
function readableRepositoryFaultsOf(params: { value: unknown; planFolder: string }): PlanFault[] {
	if (!isRecord(params.value)) return []
	const repositories = parseRepositories({
		value: params.value.repositories,
		planFolder: params.planFolder,
	})
	if (repositories.value === undefined || repositories.faults.length > 0) return []
	return checkPlanRepositories({ block: { repositories: repositories.value } })
}

function parseRepositories(params: {
	value: unknown
	planFolder: string
}): PlanParsed<Record<string, string>> {
	if (!isRecord(params.value))
		return {
			faults: [{ at: 'repositories', detail: 'repositories is an object: name -> path' }],
		}
	const entries = Object.entries(params.value)
	const faults = entries.flatMap(([name, path]) =>
		isNonEmptyText(path)
			? []
			: [{ at: `repositories.${name}`, detail: `repositories.${name} is a path (a string)` }],
	)
	const resolved = Object.fromEntries(
		entries.flatMap(([name, path]) =>
			isNonEmptyText(path) ? [[name, resolve(params.planFolder, path)]] : [],
		),
	)
	return { value: resolved, faults }
}

/** `shared`: repository name -> paths every lot of it appends to; paths only, no glob. */
function parseShared(params: {
	value: unknown
	repositories: readonly string[]
}): PlanParsed<Record<string, string[]>> {
	if (params.value === undefined) return { value: {}, faults: [] }
	if (!isRecord(params.value))
		return { faults: [{ at: 'shared', detail: 'shared is an object: repository -> paths' }] }
	const parts = Object.entries(params.value).map(([name, paths]) =>
		parseSharedPaths({ name, paths, repositories: params.repositories }),
	)
	return combinedRecordOf({ parts })
}

/** The shared paths of one repository. */
function parseSharedPaths(params: {
	name: string
	paths: unknown
	repositories: readonly string[]
}): { name: string } & PlanParsed<string[]> {
	const { name, paths } = params
	const at = `shared.${name}`
	if (!params.repositories.includes(name))
		return { name, faults: [{ at, detail: `${at} names no repository of the block` }] }
	if (!Array.isArray(paths)) return { name, faults: [{ at, detail: `${at} is a list of paths` }] }
	const faults = paths.flatMap(function sharedPathFaultOf(path: unknown, index): PlanFault[] {
		const pathAt = `${at}[${index}]`
		if (!isNonEmptyText(path)) return [{ at: pathAt, detail: `${pathAt} is a path (a string)` }]
		if (GLOB_CHARACTER_PATTERN.test(path))
			return [{ at: pathAt, detail: `${pathAt} ${path} holds a glob: shared names paths only` }]
		const fault = scopeFaultOf({ entry: path })
		return fault === undefined ? [] : [{ at: pathAt, detail: fault }]
	})
	return faults.length > 0
		? { name, faults }
		: { name, value: (paths as string[]).map(normaliseScopeEntry), faults: [] }
}

/** `lots`: each entry parsed, then the order between them checked. */
function parseLots(params: {
	value: unknown
	planFolder: string
	repositories: readonly string[]
}): PlanParsed<PlanEntry[]> {
	if (!Array.isArray(params.value))
		return { faults: [{ at: 'lots', detail: 'lots is a list of entries' }] }
	const raw: unknown[] = params.value
	const context = entryContextOf({
		raw,
		planFolder: params.planFolder,
		repositories: params.repositories,
	})
	const parsed = raw.map((value, index) => parseEntry({ value, index, context }))
	const faults = [
		...parsed.flatMap((entry) => entry.faults),
		...orderFaultsOf({ nodes: raw.map((value) => orderNodeOf({ value })) }),
		...duplicateMatchFaultsOf({ entries: parsed.map((entry) => entry.value) }),
	]
	const entries = parsed.flatMap((entry) => (entry.value === undefined ? [] : [entry.value]))
	return faults.length > 0 ? { faults } : { value: entries, faults: [] }
}

/**
 * A record realizes one entry: a `lot` or `fix` entry whose `match.handover` (the resolved path) or `match.feature`
 * is an earlier entry's is refused, one fault per later entry and key, naming the earlier id.
 */
function duplicateMatchFaultsOf(params: {
	entries: readonly (PlanEntry | undefined)[]
}): PlanFault[] {
	const firstOf = { handover: new Map<string, string>(), feature: new Map<string, string>() }
	return params.entries.flatMap(function faultsOfEntry(entry, index): PlanFault[] {
		if (entry?.match === undefined || !PLAN_REPOSITORY_KINDS.includes(entry.kind)) return []
		const { match } = entry
		return PLAN_UNIQUE_MATCH_KEYS.flatMap(function faultOfKey(key): PlanFault[] {
			const value = match[key]
			if (value === undefined) return []
			const earlier = firstOf[key].get(value)
			if (earlier === undefined) {
				firstOf[key].set(value, entry.id)
				return []
			}
			const at = `lots[${index}].match.${key}`
			return [
				{
					at,
					detail: `${at} ${value} is the match.${key} of ${earlier}: a record realizes one entry`,
				},
			]
		})
	})
}

/** What each entry is checked against: the ids (where each first is) and the group names of the block. */
function entryContextOf(params: {
	raw: readonly unknown[]
	planFolder: string
	repositories: readonly string[]
}): PlanEntryContext {
	const firstIndexOfId = new Map<string, number>()
	const groups = new Set<string>()
	for (const [index, value] of params.raw.entries()) {
		const record = isRecord(value) ? value : {}
		if (isIdShaped(record.id) && !firstIndexOfId.has(record.id))
			firstIndexOfId.set(record.id, index)
		if (isIdShaped(record.group)) groups.add(record.group)
	}
	return {
		planFolder: params.planFolder,
		repositories: [...params.repositories],
		firstIndexOfId,
		groups,
	}
}

/** One entry of `lots`, every field checked. */
function parseEntry(params: {
	value: unknown
	index: number
	context: PlanEntryContext
}): PlanParsed<PlanEntry> {
	const { value, index, context } = params
	const at = `lots[${index}]`
	if (!isRecord(value)) return { faults: [{ at, detail: `${at} is an object` }] }
	const kind = PLAN_ENTRY_KINDS.find((known) => known === value.kind)
	const id = parseId({ value: value.id, at, index, context })
	const group = parseGroup({ value: value.group, at, context })
	const title = parseTitle({ value: value.title, at })
	const dependsOn = parseDependsOn({ value: value.dependsOn, at, context })
	const spec = parsePlanPath({ value: value.spec, at: `${at}.spec`, context })
	const brief = parsePlanPath({ value: value.brief, at: `${at}.brief`, context })
	const parked = parseParked({ value: value.parked, at })
	const scope = parseEntryScope({ value: value.scope, at: `${at}.scope`, kind, context })
	const heavy = parseHeavy({ value: value.heavy, at: `${at}.heavy` })
	const match = parseEntryMatch({ value: value.match, at: `${at}.match`, kind, context })
	const faults = [
		...unknownKeyFaults({ value, keys: PLAN_ENTRY_KEYS, at }),
		...id.faults,
		...group.faults,
		...title.faults,
		...(kind === undefined
			? [{ at: `${at}.kind`, detail: `${at}.kind is one of ${PLAN_ENTRY_KINDS.join(', ')}` }]
			: []),
		...dependsOn.faults,
		...spec.faults,
		...brief.faults,
		...parked.faults,
		...scope.faults,
		...heavy.faults,
		...match.faults,
	]
	if (
		faults.length > 0 ||
		id.value === undefined ||
		title.value === undefined ||
		kind === undefined ||
		dependsOn.value === undefined ||
		scope.value === undefined ||
		heavy.value === undefined
	)
		return { faults }
	return {
		value: {
			id: id.value,
			...(group.value !== undefined && { group: group.value }),
			title: title.value,
			kind,
			dependsOn: dependsOn.value,
			...(spec.value !== undefined && { spec: spec.value }),
			scope: scope.value,
			heavy: heavy.value,
			...(brief.value !== undefined && { brief: brief.value }),
			...(match.value !== undefined && { match: match.value }),
			...(parked.value !== undefined && { parked: parked.value }),
		},
		faults: [],
	}
}

/** `id`: id-shaped, at most 40 characters, the first entry holding it. */
function parseId(params: {
	value: unknown
	at: string
	index: number
	context: PlanEntryContext
}): PlanParsed<string> {
	const at = `${params.at}.id`
	if (!isIdShaped(params.value))
		return {
			faults: [
				{
					at,
					detail: `${at} matches ${PLAN_ID_PATTERN.source}, at most ${PLAN_ID_MAX_LENGTH} characters`,
				},
			],
		}
	if (params.context.firstIndexOfId.get(params.value) !== params.index)
		return { faults: [{ at, detail: `${at} ${params.value} is the id of an earlier entry` }] }
	return { value: params.value, faults: [] }
}

/** `group`: optional, id-shaped, never the id of an entry. */
function parseGroup(params: {
	value: unknown
	at: string
	context: PlanEntryContext
}): PlanParsed<string | undefined> {
	const at = `${params.at}.group`
	if (params.value === undefined) return { value: undefined, faults: [] }
	if (!isIdShaped(params.value))
		return { faults: [{ at, detail: `${at} is an id-shaped name (${PLAN_ID_PATTERN.source})` }] }
	if (params.context.firstIndexOfId.has(params.value))
		return {
			faults: [{ at, detail: `${at} ${params.value} is the id of an entry: a group name is not` }],
		}
	return { value: params.value, faults: [] }
}

/** `title`: one line, at most 120 characters. */
function parseTitle(params: { value: unknown; at: string }): PlanParsed<string> {
	const at = `${params.at}.title`
	if (
		!isNonEmptyText(params.value) ||
		LINE_BREAK_PATTERN.test(params.value) ||
		params.value.length > PLAN_TITLE_MAX_LENGTH
	)
		return {
			faults: [{ at, detail: `${at} is one line of at most ${PLAN_TITLE_MAX_LENGTH} characters` }],
		}
	return { value: params.value, faults: [] }
}

/** `dependsOn`: optional, ids or groups of this block. */
function parseDependsOn(params: {
	value: unknown
	at: string
	context: PlanEntryContext
}): PlanParsed<string[]> {
	const at = `${params.at}.dependsOn`
	if (params.value === undefined) return { value: [], faults: [] }
	if (!Array.isArray(params.value))
		return { faults: [{ at, detail: `${at} is a list of ids or groups` }] }
	const { context } = params
	const faults = params.value.flatMap(function dependencyFaultOf(
		name: unknown,
		index,
	): PlanFault[] {
		if (typeof name === 'string' && (context.firstIndexOfId.has(name) || context.groups.has(name)))
			return []
		return [
			{
				at: `${at}[${index}]`,
				detail: `${at}[${index}] ${String(name)} names no id or group of the block`,
			},
		]
	})
	return faults.length > 0 ? { faults } : { value: params.value as string[], faults: [] }
}

/** A file path relative to the plan (`spec`, `brief`), resolved; optional. */
function parsePlanPath(params: {
	value: unknown
	at: string
	context: PlanEntryContext
}): PlanParsed<string | undefined> {
	if (params.value === undefined) return { value: undefined, faults: [] }
	if (!isNonEmptyText(params.value))
		return { faults: [{ at: params.at, detail: `${params.at} is a path relative to the plan` }] }
	return { value: resolve(params.context.planFolder, params.value), faults: [] }
}

/** `parked`: optional, one line saying why. */
function parseParked(params: { value: unknown; at: string }): PlanParsed<string | undefined> {
	const at = `${params.at}.parked`
	if (params.value === undefined) return { value: undefined, faults: [] }
	if (!isNonEmptyText(params.value) || LINE_BREAK_PATTERN.test(params.value))
		return { faults: [{ at, detail: `${at} is one line saying why the entry is parked` }] }
	return { value: params.value, faults: [] }
}

/** `scope`: required for a lot or a fix, refused for a spec or a person; checked whatever the kind when given. */
function parseEntryScope(params: {
	value: unknown
	at: string
	kind: PlanEntryKind | undefined
	context: PlanEntryContext
}): PlanParsed<Record<string, string[]>> {
	const { value, at, kind } = params
	const takesScope = kind !== undefined && PLAN_REPOSITORY_KINDS.includes(kind)
	if (value === undefined)
		return takesScope
			? { faults: [{ at, detail: `a ${kind} entry names its scope: repository -> paths` }] }
			: { value: {}, faults: [] }
	if (kind !== undefined && !takesScope)
		return { faults: [{ at, detail: `a ${kind} entry takes no scope` }] }
	if (!isRecord(value) || Object.keys(value).length === 0)
		return { faults: [{ at, detail: `${at} is an object: repository -> 1 or more paths` }] }
	const parts = Object.entries(value).map(([name, entries]) =>
		parseScopeEntries({ name, entries, at, repositories: params.context.repositories }),
	)
	return combinedRecordOf({ parts })
}

/** The scope entries of one repository, normalised as a brief's; `"."` kept for the whole repository. */
function parseScopeEntries(params: {
	name: string
	entries: unknown
	at: string
	repositories: readonly string[]
}): { name: string } & PlanParsed<string[]> {
	const { name, entries } = params
	const at = `${params.at}.${name}`
	if (!params.repositories.includes(name))
		return { name, faults: [{ at, detail: `${at} names no repository of the block` }] }
	if (!Array.isArray(entries) || entries.length === 0)
		return { name, faults: [{ at, detail: `${at} is a list of 1 or more paths or globs` }] }
	const read = entries.map((entry: unknown, index) =>
		scopeEntryOf({ entry, at: `${at}[${index}]` }),
	)
	const faults = read.flatMap((entry) => entry.faults)
	if (faults.length > 0) return { name, faults }
	return {
		name,
		value: read.flatMap((entry) => (entry.value === undefined ? [] : [entry.value])),
		faults: [],
	}
}

/** One scope entry: `"."` (the whole repository) as it is, else refused or normalised as a brief's entry. */
function scopeEntryOf(params: { entry: unknown; at: string }): PlanParsed<string> {
	const { entry, at } = params
	if (!isNonEmptyText(entry))
		return { faults: [{ at, detail: `${at} is a path or a glob (a string)` }] }
	if (WHOLE_REPOSITORY_PATTERN.test(entry)) return { value: WHOLE_REPOSITORY_ENTRY, faults: [] }
	const fault = scopeFaultOf({ entry })
	return fault === undefined
		? { value: normaliseScopeEntry(entry), faults: [] }
		: { faults: [{ at, detail: fault }] }
}

/** `heavy`: optional, a list of the extra heavy kinds. */
function parseHeavy(params: { value: unknown; at: string }): PlanParsed<PlanHeavyKind[]> {
	const { value, at } = params
	if (value === undefined) return { value: [], faults: [] }
	if (!Array.isArray(value))
		return { faults: [{ at, detail: `${at} is a list of ${PLAN_HEAVY_KINDS.join(', ')}` }] }
	const kinds = value.map((kind: unknown) => PLAN_HEAVY_KINDS.find((known) => known === kind))
	const faults = kinds.flatMap((kind, index) =>
		kind === undefined
			? [
					{
						at: `${at}[${index}]`,
						detail: `${at}[${index}] is one of ${PLAN_HEAVY_KINDS.join(', ')}`,
					},
				]
			: [],
	)
	return faults.length > 0
		? { faults }
		: { value: kinds.flatMap((kind) => (kind === undefined ? [] : [kind])), faults: [] }
}

/** `match`: required for a lot or a fix; `branch` required, `handover` resolved against the plan. */
function parseEntryMatch(params: {
	value: unknown
	at: string
	kind: PlanEntryKind | undefined
	context: PlanEntryContext
}): PlanParsed<PlanEntry['match']> {
	const { value, at, kind } = params
	if (value === undefined)
		return kind !== undefined && PLAN_REPOSITORY_KINDS.includes(kind)
			? {
					faults: [{ at, detail: `a ${kind} entry names how its records are found: match.branch` }],
				}
			: { value: undefined, faults: [] }
	if (!isRecord(value))
		return { faults: [{ at, detail: `${at} is an object: branch, handover, feature` }] }
	const handover = parsePlanPath({
		value: value.handover,
		at: `${at}.handover`,
		context: params.context,
	})
	const featureFaults =
		value.feature === undefined || isNonEmptyText(value.feature)
			? []
			: [{ at: `${at}.feature`, detail: `${at}.feature is a store lot's feature (a string)` }]
	const faults = [
		...unknownKeyFaults({ value, keys: PLAN_MATCH_KEYS, at }),
		...(isNonEmptyText(value.branch)
			? []
			: [{ at: `${at}.branch`, detail: `${at}.branch is the branch the entry's records are on` }]),
		...handover.faults,
		...featureFaults,
	]
	if (faults.length > 0 || !isNonEmptyText(value.branch)) return { faults }
	return {
		value: {
			branch: value.branch,
			...(handover.value !== undefined && { handover: handover.value }),
			...(isNonEmptyText(value.feature) && { feature: value.feature }),
		},
		faults: [],
	}
}

/** What the order checks read of an entry, each field taken only when it holds. */
function orderNodeOf(params: { value: unknown }): PlanOrderNode {
	const record = isRecord(params.value) ? params.value : {}
	const match = isRecord(record.match) ? record.match : {}
	return {
		id: isIdShaped(record.id) ? record.id : undefined,
		group: isIdShaped(record.group) ? record.group : undefined,
		dependsOn: Array.isArray(record.dependsOn)
			? record.dependsOn.filter((name: unknown): name is string => typeof name === 'string')
			: [],
		branch: isNonEmptyText(match.branch) ? match.branch : undefined,
		hasHandover: isNonEmptyText(match.handover),
	}
}

/** The keys of `value` outside `keys`, each a fault at its own place. */
function unknownKeyFaults(params: {
	value: Record<string, unknown>
	keys: readonly string[]
	at: string
}): PlanFault[] {
	return Object.keys(params.value)
		.filter((key) => !params.keys.includes(key))
		.map((key) => {
			const at = params.at === '' ? key : `${params.at}.${key}`
			return { at, detail: `${at}: unknown key ${key} (known: ${params.keys.join(', ')})` }
		})
}

/** The record of named parts, or every fault of them. */
function combinedRecordOf<Value>(params: {
	parts: readonly ({ name: string } & PlanParsed<Value>)[]
}): PlanParsed<Record<string, Value>> {
	const faults = params.parts.flatMap((part) => part.faults)
	if (faults.length > 0) return { faults }
	return {
		value: Object.fromEntries(
			params.parts.flatMap((part) => (part.value === undefined ? [] : [[part.name, part.value]])),
		),
		faults: [],
	}
}

function isIdShaped(value: unknown): value is string {
	return (
		typeof value === 'string' && value.length <= PLAN_ID_MAX_LENGTH && PLAN_ID_PATTERN.test(value)
	)
}

function isNonEmptyText(value: unknown): value is string {
	return typeof value === 'string' && value !== ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
