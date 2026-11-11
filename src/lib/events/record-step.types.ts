import type { StepCounts, StepResult, StepSelection, StepStatus } from '../gate/gate.types.ts'
import type { WorktreeCli } from './event.types.ts'

/**
 * The step families a step records as (`gate-release` is the `--release` mode); the last seven are step 5's: the
 * tdd receipts, a mutation run, a hand-over run and its rehearsal, a review throwaway, a worktree.
 */
export type RecordedStepKind =
	| 'gate-fast'
	| 'gate-full'
	| 'gate-release'
	| 'gate-hook'
	| 'contrib'
	| 'tdd-red'
	| 'tdd-green'
	| 'mutation'
	| 'rehearsal'
	| 'handover-run'
	| 'throwaway-add'
	| 'worktree-add'

/**
 * Where a step that knows its lot records, instead of finding it from a folder: the lot's folder, the real path of
 * the worktree the step is about, and whether that worktree is a review throwaway.
 */
export type StepExplicitPlace = {
	lot: string
	worktree: string
	throwaway: boolean
}

/** How much of a run's configured steps a record answered: none, some, or all (the tdd step never counts). */
export type StepReuse = 'none' | 'partly' | 'whole'

/** One part of a gate or contrib run as its `step.end` event lists it. */
export type StepPart = {
	name: string
	status: StepStatus
	counts: StepCounts
	durationMs: number
	reused: boolean
	rerun: boolean
	heavy: boolean
	selection: Pick<StepSelection, 'base' | 'ids' | 'changed'> | null
	failing: string[] | null
}

/** What starts a recorded step. */
export type StartStepParams = {
	/** The folder the step runs in: its lot is found from it unless `place` is given. */
	cwd: string
	step: RecordedStepKind
	/** The kind is heavy (`gate-full`, `contrib`, `mutation`, `rehearsal`, ...): a marker spans the whole run. */
	heavy: boolean
	/**
	 * A step that knows its lot: that lot, never one guessed from `cwd`; `null`: the step has no lot (no event, a heavy
	 * one still writes its marker). Left out: the lot is found from `cwd` (`lotOfStep`).
	 */
	place?: StepExplicitPlace | null
	/** Where the one `events: not recorded: <reason>` line goes (standard error unless given). */
	warn?: (line: string) => void
}

/** How a `worktree-add` step got its `node_modules`; the cli never runs `npm ci`. */
export type WorktreeAddParts = { nodeModules: 'pooled' | 'cloned' | 'none'; npmCi: false }

/** What ends a recorded step: its exit, or that it was interrupted, and what it checked. */
export type EndStepParams = {
	exit?: number
	outcome?: 'interrupted'
	/** A gate's or contrib's parts, a worktree's `node_modules`; left out by a step that has none. */
	parts?: StepPart[] | WorktreeAddParts
	/** Left out by a step no record answers (tdd, mutation, a hand-over run, a throwaway, a worktree). */
	reuse?: StepReuse
	stateHash: string | null
}

/** A running recorded step: never throws, every failure becomes the one warning line. */
export type StepHandle = {
	/**
	 * A part starts (a heavy one of a kind that is not heavy writes its marker `<step>: <name>`); the answer finishes
	 * it (its marker removed) and answers how long it ran, in milliseconds.
	 */
	startPart: (params: { name: string; heavy: boolean }) => () => number
	end: (params: EndStepParams) => void
}

/** The parts of a run as its results give them: how long each ran, and which a record answered. */
export type PartsOfParams = {
	results: readonly StepResult[]
	/** Per result, how long it ran; a result not timed (not run, skipped, reused) lasted 0. */
	durations: ReadonlyMap<StepResult, number>
	/** The results a record answered instead of a run. */
	reused: ReadonlySet<StepResult>
}

/** Where a recorded step writes: its lot's file, and what the envelope and the start say of it. */
export type StepPlace = {
	lot: string
	file: string
	simulated: boolean
	worktree: string
	throwaway: boolean
	/** The cli of the lot's worktree: omitted when that worktree is gone or does not read. */
	worktreeCli: WorktreeCli | null | undefined
}
