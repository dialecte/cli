import type { GateStep } from '../gate/gate-config.types.ts'
import type { BuiltinStep } from './contrib.types.ts'

/** The package steps of `dialecte contrib` when the package declares no `dialecte.contrib.steps`. */
export const DEFAULT_CONTRIB_STEPS: readonly GateStep[] = [
	{ name: 'docs', run: 'npm run doc:build', restoresGeneratedDocs: true },
	{ name: 'type-bench', run: 'npm run type-bench:check' },
]

/** The rows `dialecte contrib` runs in process: first and last, around the package steps. */
export const CONTRIB_BUILTIN_STEPS: Readonly<Record<'first' | 'last', BuiltinStep>> = {
	first: { name: 'rules', builtin: 'rules' },
	last: { name: 'release', builtin: 'release' },
}

/** `dialecte contrib` in a consumer: the contributor checks are a dialecte package's. */
export const CONTRIB_CONSUMER_REFUSAL =
	'contrib: no contributor checks in the consumer profile ("dialecte": { "profile": "contributor" } in a dialecte package)'

/** How the contrib step list is named in a `GateConfigError`. */
export const CONTRIB_STEPS_LABEL = 'dialecte.contrib.steps'

/** How the key of contrib's opt-outs is named in a `GateConfigError`. */
export const CONTRIB_SKIP_LABEL = 'dialecte.contrib.skip'

/** A `dialecte.contrib.steps` that is no list. */
export const INVALID_CONTRIB_STEPS =
	'dialecte.contrib.steps: a list of steps, such as [{ "name": "docs", "run": "npm run doc:build" }]'

/** What a built-in row runs, as the record's command hash holds it: the row and the cli that runs it. */
export const BUILTIN_STEP_COMMAND = 'dialecte {builtin} (cli {version})'

/** The note of a package step a green `gate --full` record of this tree and install passed with the same command. */
export const GATE_STEP_REUSED_NOTE = 'reused from gate --full at {at}'

/** The rules row when nothing changed against HEAD. */
export const NO_CHANGED_FILE_NOTE = 'no changed file to check'

/** The release row when no dependency is named by a local folder. */
export const NO_LOCAL_DEPENDENCY_NOTE = 'no local dependency'

/** The reason of a failed rules row: its first error, then how many more (every finding is listed under the row). */
export const RULES_FIRST_ERROR = 'first: {file} {rule}'
export const RULES_MORE_ERRORS = ', {count} more'

/** The mode of a contrib run's record, in the worktree's git folder and in the store. */
export const CONTRIB_RECORD_MODE = 'contrib'

/** The command a reused contrib record is named by. */
export const CONTRIB_COMMAND = 'contrib'

/** `dialecte contrib` outside a git repository, or in one without a commit. */
export const CONTRIB_NO_REPOSITORY =
	'contrib: {root} is in no git repository: contrib checks the changes against HEAD, run it inside the repository of the package'
export const CONTRIB_NO_COMMIT =
	'contrib: the repository at {root} has no commit yet: the rules row reads the changes against HEAD, commit a base first'

/** The mark of a row that warns (a mutation run still running), as wide as a step line's marks. */
export const CONTRIB_WARNING_MARK = 'warn'

/** The verdicts of `dialecte contrib`. */
export const CONTRIB_GREEN_VERDICT = 'contrib: green'
export const CONTRIB_REUSED_VERDICT = 'contrib: green (reused)'
export const CONTRIB_FAILED_VERDICT = 'contrib: failed at {rows}'
