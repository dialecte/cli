import type { CheckKey, RecordOrigin } from '../gate-records/gate-records.types.ts'
import type { ModeCommandHashes } from '../gate-records/mode-command-hashes.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { LiveOutput } from '../progress/step-progress.types.ts'
import type { GateRunBase, HandoverBase } from './gate-base.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepResult } from './gate.types.ts'

/** Where `gate --hook` looks its steps up: the committed tree, what the tree locks, and the store to read. */
export type HookAnswerPlace = {
	cwd: string
	/** The tree of the index git hands the hook. */
	tree: string
	treeKey: Pick<CheckKey, 'lockHash' | 'linked'>
	/** The absolute git common dir whose store to read instead of the repository's own. */
	checkStore: string | undefined
}

/** What `answerHookSteps` needs beyond the place: the steps, their hashes at the hook base, the whole-key hashes. */
export type HookAnswerParams = HookAnswerPlace & {
	steps: readonly GateStep[]
	/** Each hook step's `hashGateStep` at the hook base, by name. */
	stepHashes: ReadonlyMap<string, string>
	/** The empty tree, where a scoped step recorded by a run that checked everything is looked up too. */
	emptyTree: string
	/** The command hashes of each mode, for the answer of a record of an older cli (no step hashes). */
	hashes: ModeCommandHashes
}

/** The hook steps a record answered: their results, the run that really ran each, and the lines saying so. */
export type HookAnswers = {
	/** One result per answered step, in list order. */
	results: StepResult[]
	/** The run that really ran each answered step, by name. */
	origins: ReadonlyMap<string, RecordOrigin>
	/** The lines the hook prints for them, in list order. */
	lines: string[]
}

/** What a hook run starts from, once its steps and base are known (`prepareHookRun`). */
export type PreparedHookRun = {
	packageJson: PackageJson
	/** The full list's steps but the scoped ones that count no tests, in list order. */
	hookSteps: GateStep[]
	/** The hook base with its lines, when a hook step is scoped (said on the hook's base line). */
	shown: GateRunBase | undefined
	/** The hook base's commit, when a full step is scoped: it enters a scoped step's hash. */
	gateBase: string | undefined
	hasHead: boolean
	/** The tree of the index git hands the hook. */
	tree: string
	treeKey: Pick<CheckKey, 'lockHash' | 'linked'>
	/** Each hook step's `hashGateStep` at the hook base, by name. */
	stepHashes: ReadonlyMap<string, string>
}

/** The store `gate --hook` was given (`DIALECTE_CHECK_STORE`): honoured, or the line saying why not; neither when none. */
export type GivenCheckStore = {
	/** The absolute path of an existing folder: the git common dir whose store the hook reads and writes. */
	checkStore?: string
	/** The line the hook starts with when the value given is no such path. */
	ignored?: string
}

/** The steps `gate --hook` runs of its own before the declared ones (its tdd step), with how long each took. */
export type OwnHookSteps = {
	results: StepResult[]
	durations: ReadonlyMap<StepResult, number>
}

/** What `gate --hook` is run with (`runHookGate`). */
export type HookGateParams = {
	cwd: string
	argv: string[]
	/** The index file git handed the commit hook (relative: to the worktree top); default: the worktree's own index. */
	indexFile: string | undefined
	/** False when what is committed is unknown (git variables naming another repository): every step runs. */
	reusable: boolean
	live: LiveOutput | undefined
	/** The base a hand-over run handed down. */
	handoverBase: HandoverBase | undefined
	/** Why a hand-over variable given without the other was ignored. */
	handoverIgnored: string | undefined
	/** The absolute git common dir whose store the hook reads and writes (a rehearsal clone's); its records are a rehearsal's. */
	checkStore?: string
	/** The line saying why a given store was ignored: the hook's first line. */
	checkStoreIgnored?: string
	/**
	 * The release base a rehearsal handed (`DIALECTE_RELEASE_BASE`), as given: a full commit id the repository holds,
	 * else the hook refuses; handed to its rules step alone.
	 */
	releaseBase?: string
	/** Where the one `events: not recorded: <reason>` line goes (standard error unless given). */
	warn?: (line: string) => void
}
