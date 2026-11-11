/**
 * Hand-written blocks and facts for the pure plan tests (entry states, proposals): small builders with defaults,
 * no file system.
 */
import { planEntryOf } from './plan-facts.ts'

import type { EntryStatus, PlanStates } from '../src/lib/plan/entry-state.types.ts'
import type { PlanBlock, PlanEntry } from '../src/lib/plan/plan-block.types.ts'
import type {
	PlanFacts,
	PlanMark,
	RegistryFact,
	RepositoryFacts,
	SpecStatusName,
	StoreLotFact,
	WorktreeFact,
} from '../src/lib/plan/plan.types.ts'
import type { RepositorySpec } from './plan-state-facts.types.ts'

/** The absolute path of a file beside the plan. */
export function planFile(name: string): string {
	return `/plans/${name}`
}

/** A `lot` entry: scope `src/<id>/` in `cli`, branch `feat/<id lower-cased>`, unless overridden. */
export function lotOf(id: string, overrides: Partial<PlanEntry> = {}): PlanEntry {
	return planEntryOf({
		id,
		scope: { cli: [`src/${id}/`] },
		match: { branch: branchOf(id) },
		...overrides,
	})
}

/** A `fix` entry, as `lotOf`. */
export function fixOf(id: string, overrides: Partial<PlanEntry> = {}): PlanEntry {
	return lotOf(id, { kind: 'fix', ...overrides })
}

/** A `person` entry: no scope, no match. */
export function personOf(id: string, overrides: Partial<PlanEntry> = {}): PlanEntry {
	return planEntryOf({ id, kind: 'person', ...overrides })
}

/** A `spec` entry writing `spec`. */
export function specEntryOf(
	id: string,
	spec: string,
	overrides: Partial<PlanEntry> = {},
): PlanEntry {
	return planEntryOf({ id, kind: 'spec', spec, ...overrides })
}

/** The branch `lotOf` gives an entry. */
export function branchOf(id: string): string {
	return `feat/${id.toLowerCase()}`
}

/** A block over `cli` (and `core`) at `/work/<name>`. */
export function blockOf(params: {
	lots: PlanEntry[]
	shared?: Record<string, string[]>
	repositories?: string[]
}): PlanBlock {
	const names = params.repositories ?? ['cli']
	return {
		schema: 1,
		repositories: Object.fromEntries(names.map((name) => [name, `/work/${name}`])),
		shared: params.shared ?? {},
		lots: params.lots,
	}
}

/** The facts of a block: each repository from its spec, the spec statuses by absolute file, the marks. */
export function factsOf(params: {
	repositories?: Record<string, RepositorySpec>
	specs?: Record<string, SpecStatusName>
	briefs?: Record<string, boolean>
	marks?: PlanMark[]
}): PlanFacts {
	const repositories = params.repositories ?? { cli: {} }
	return {
		repositories: Object.fromEntries(
			Object.entries(repositories).map(([name, spec]) => [name, repositoryFactsOf({ name, spec })]),
		),
		specs: Object.fromEntries(
			Object.entries(params.specs ?? {}).map(([file, status]) => [
				file,
				{ status, line: status === 'missing' ? undefined : `Status: ${status}` },
			]),
		),
		briefs: params.briefs ?? {},
		marks: params.marks ?? [],
	}
}

/** A store lot fact: open and working unless overridden; name only required. */
export function storeLotOf(overrides: Partial<StoreLotFact> & { name: string }): StoreLotFact {
	return {
		branch: `feat/${overrides.name}`,
		feature: overrides.name,
		state: 'working',
		open: true,
		scope: [],
		worktree: null,
		...overrides,
	}
}

/** A registry fact: pending, written 2026-11-04, folder beside the plan, unless overridden. */
export function registryOf(
	overrides: Partial<RegistryFact> & { name: string; branch: string },
): RegistryFact {
	return {
		folder: planFile(overrides.name),
		worktree: '',
		written: '2026-11-04T09:00:00.000Z',
		state: 'pending',
		...overrides,
	}
}

/** A linked worktree fact `/work/.worktrees/<name>`. */
export function worktreeOf(name: string, branch: string | undefined): WorktreeFact {
	return { name, path: `/work/.worktrees/${name}`, branch }
}

/** A person's mark on `id`. */
export function markOf(id: string): PlanMark {
	return {
		plan: '/plans/plan.md',
		id,
		state: 'done',
		by: 'tester',
		reason: null,
		at: '2026-11-10T08:00:00.000Z',
	}
}

/** The states keyed by entry id. */
export function byId(states: PlanStates): Record<string, EntryStatus> {
	return Object.fromEntries(states.entries.map((status) => [status.id, status]))
}

/** The repository facts of one spec: readable at `/work/<name>`, or not readable with the reason. */
function repositoryFactsOf(params: { name: string; spec: RepositorySpec }): RepositoryFacts {
	const path = `/work/${params.name}`
	if (typeof params.spec === 'string') return { readable: false, path, reason: params.spec }
	return {
		readable: true,
		path,
		common: `${path}/.git`,
		caseInsensitive: params.spec.caseInsensitive ?? false,
		storeLots: params.spec.storeLots ?? [],
		registry: params.spec.registry ?? [],
		worktrees: params.spec.worktrees ?? [],
	}
}
