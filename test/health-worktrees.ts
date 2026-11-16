/** The worktree rules' cases: repositories built in memory, and the scratch common dirs of the readers. */
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { pairRuns } from '../src/lib/events/pair-runs.ts'
import { STORE_ENTRY_EXTENSION } from '../src/lib/handover/handover.constants.ts'
import {
	HOUR_MS,
	SCRATCH_REPOSITORY,
	TMP_FOLDER,
	WORKTREE_LOT,
	WORKTREES_FOLDER,
	WORKTREES_NOW,
} from './health-worktrees.constants.ts'
import { REPOSITORY_FOLDER } from './health.constants.ts'
import { stepRunEvents } from './health.ts'
import { identityOf, writeRecordFile } from './store-records.ts'

import type { LotEvent } from '../src/lib/events/event.types.ts'
import type {
	HealthFinding,
	HealthLot,
	HealthRepository,
	HealthWorktree,
	ScratchFolder,
} from '../src/lib/health/health.types.ts'
import type {
	AddFindingParams,
	AddSpec,
	HandoverEntryParams,
	IdleFindingParams,
	LotIdentityParams,
	RegisteredWorktreeParams,
	ScratchSpec,
	WorktreeLotSpec,
	WorktreeSpec,
} from './health-worktrees.types.ts'

/** The path a worktree of that name has unless a case gives one. */
export function worktreePathOf(name: string): string {
	return `${WORKTREES_FOLDER}/${name}`
}

/** The time `milliseconds` before the clock, ISO. */
export function beforeClock(milliseconds: number): string {
	return new Date(WORKTREES_NOW.getTime() - milliseconds).toISOString()
}

/** A registered worktree idle for `idleMs` (zero unless given). */
export function worktreeOf(spec: WorktreeSpec): HealthWorktree {
	return {
		name: spec.name,
		path: spec.path ?? worktreePathOf(spec.name),
		gone: spec.gone ?? false,
		createdAt: beforeClock(spec.createdMs ?? (spec.idleMs ?? 0) + 1_000),
		activeAt: beforeClock(spec.idleMs ?? 0),
		...(spec.handover === undefined ? {} : { handover: spec.handover }),
	}
}

function lotOf(params: { spec: WorktreeLotSpec; index: number }): HealthLot {
	const { spec, index } = params
	const name = spec.name ?? `${String(index + 1).padStart(4, '0')}-cli-lot`
	const events = spec.events ?? []
	const state = 'state' in spec ? spec.state : 'working'
	return {
		name,
		folder: `/workspace/${REPOSITORY_FOLDER}/.git/dialecte-lots/${name}`,
		events,
		runs: pairRuns({ events }).runs,
		...(state === undefined ? {} : { state }),
		...(spec.worktree === undefined ? {} : { worktree: spec.worktree }),
	}
}

/** A repository of the worktrees and lots given (no record). */
export function worktreesRepositoryOf(params: {
	worktrees?: WorktreeSpec[]
	lots?: WorktreeLotSpec[]
}): HealthRepository {
	return {
		name: REPOSITORY_FOLDER,
		common: `/workspace/${REPOSITORY_FOLDER}/.git`,
		lots: (params.lots ?? []).map((spec, index) => lotOf({ spec, index })),
		records: [],
		worktrees: (params.worktrees ?? []).map(worktreeOf),
	}
}

/** The idle worktrees: `count` of them, the n-th idle 48 h + n hours, named `<n>-cli-w`; the last one is the oldest. */
export function idleWorktreesOf(count: number): WorktreeSpec[] {
	return Array.from({ length: count }, (_, position) => ({
		name: `${String(position + 1).padStart(4, '0')}-cli-w`,
		idleMs: 48 * HOUR_MS + position * HOUR_MS,
	}))
}

/** The finding of the idle rule: amber unless given, no detail unless given. */
export function idleFinding(params: IdleFindingParams): HealthFinding {
	return {
		rule: 'worktrees',
		severity: params.severity ?? 'amber',
		repository: REPOSITORY_FOLDER,
		at: WORKTREES_NOW.toISOString(),
		text: params.text,
		detail: params.detail ?? [],
	}
}

/** The events of one worktree creation; the end carries `parts` when given. */
export function addEvents(params: { spec: AddSpec; run: string }): LotEvent[] {
	const { spec, run } = params
	const endMs = Date.parse(spec.endAt)
	const [start, end] = stepRunEvents({
		lot: spec.lot ?? WORKTREE_LOT,
		run,
		step: spec.step,
		startAt: new Date(endMs - spec.durationMs).toISOString(),
		endAt: spec.endAt,
	})
	const written = spec.parts === undefined ? end : { ...end, parts: spec.parts }
	return spec.withoutStart === true ? [written] : [start, written]
}

/** A repository whose lots hold the creations given, each in the events of its lot. */
export function addsRepositoryOf(params: { adds: AddSpec[] }): HealthRepository {
	const names = [...new Set(params.adds.map((spec) => spec.lot ?? WORKTREE_LOT))]
	const lots: WorktreeLotSpec[] = names.map((name) => ({
		name,
		events: params.adds
			.map((spec, index) => ({ spec, index }))
			.filter(({ spec }) => (spec.lot ?? WORKTREE_LOT) === name)
			.flatMap(({ spec, index }) => addEvents({ spec, run: `run-${index}` })),
	}))
	return worktreesRepositoryOf({ lots })
}

/** The finding of the slow-add rule: amber, at the start, of the case's lot unless given. */
export function addFinding(params: AddFindingParams): HealthFinding {
	return {
		rule: 'worktrees',
		severity: 'amber',
		repository: REPOSITORY_FOLDER,
		lot: params.lot ?? WORKTREE_LOT,
		at: params.at,
		text: params.text,
		detail: params.detail ?? [],
	}
}

/** The scratch folders given, each in the temporary folder, modified `ageMs` before the clock. */
export function scratchFoldersOf(specs: ScratchSpec[]): ScratchFolder[] {
	return specs.map((spec) => ({
		path: `${TMP_FOLDER}/${spec.name}`,
		modifiedAt: beforeClock(spec.ageMs),
	}))
}

/** The finding of the scratch rule: amber, at the clock. */
export function scratchFinding(params: { text: string; detail: string[] }): HealthFinding {
	return {
		rule: 'worktrees',
		severity: 'amber',
		repository: SCRATCH_REPOSITORY,
		at: WORKTREES_NOW.toISOString(),
		text: params.text,
		detail: params.detail,
	}
}

/** Registers a worktree under a common dir: its `gitdir` (naming `<path>/.git`) and the `index` and `HEAD` given. */
export function writeRegisteredWorktree(params: RegisteredWorktreeParams): void {
	const folder = join(params.common, 'worktrees', params.name)
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, 'gitdir'), `${params.path}/.git\n`)
	for (const [file, at] of [
		['index', params.indexAt],
		['HEAD', params.headAt],
	] as const) {
		if (at === undefined) continue
		writeFileSync(join(folder, file), '')
		utimesSync(join(folder, file), at, at)
	}
}

/** Writes the hand-over entry of a worktree, as `handover write` records it. */
export function writeHandoverEntry(params: HandoverEntryParams): void {
	const entry = {
		folder: `${params.common}/dialecte-lots/${params.name}`,
		branch: 'feat/branch',
		worktree: params.worktree,
		written: '2026-11-10T08:00:00.000Z',
		state: params.state,
		...(params.closed === undefined ? {} : { closed: params.closed }),
	}
	writeRecordFile({
		folder: join(params.common, 'dialecte-handover'),
		name: `${params.name}${STORE_ENTRY_EXTENSION}`,
		text: `${JSON.stringify(entry, null, 2)}\n`,
	})
}

/** Writes the identity of a lot of a common dir, naming `worktree`. */
export function writeLotIdentity(params: LotIdentityParams): void {
	writeRecordFile({
		folder: join(params.common, 'dialecte-lots', params.name),
		name: 'identity.json',
		text: `${JSON.stringify({ ...identityOf({ name: params.name }), worktree: params.worktree }, null, 2)}\n`,
	})
}

/** Matches an ISO 8601 time string, in the form `toISOString` writes, that is not later than `limit`. */
export function isoTimeNoLaterThan(limit: Date): { asymmetricMatch: (value: unknown) => boolean } {
	return {
		asymmetricMatch(value) {
			if (typeof value !== 'string') return false
			const time = new Date(value)
			return time.toISOString() === value && time.getTime() <= limit.getTime()
		},
	}
}
