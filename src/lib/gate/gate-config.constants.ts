import type { GateStep } from './gate-config.types.ts'

/**
 * The Definition of Done of a Dialecte package when its package.json declares no `dialecte.gate`.
 * `--fast` while iterating; `--full` once per lot: the whole suite runs niced and one file at a time,
 * so it shares a laptop with other sessions.
 */
export const DEFAULT_GATE_STEPS: Readonly<Record<'fast' | 'full', readonly GateStep[]>> = {
	fast: [
		{ name: 'check', run: 'npm run check' },
		{ name: 'skills', run: 'npm run skills:check' },
		{ name: 'tests', run: 'npx vitest run --changed', counts: 'tests', changedOnly: true },
	],
	full: [
		{ name: 'check', run: 'npm run check' },
		{ name: 'skills', run: 'npm run skills:check' },
		{ name: 'build', run: 'npm run build' },
		{ name: 'tests', run: 'nice -n 10 npx vitest run --no-file-parallelism', counts: 'tests' },
		{ name: 'docs', run: 'npm run doc:build', restoresGeneratedDocs: true },
		{ name: 'type-bench', run: 'npm run type-bench:check' },
	],
}

/** `npm run <script>` at the start of a step: a package without that script skips the step. */
export const NPM_RUN_PATTERN = /^npm run ([^\s;&|]+)/

/** How many last lines of a failed step's output the gate prints. */
export const FAILED_OUTPUT_TAIL_LINES = 30

/** What vitest prints when it finds no test file to run (with `--changed`: none the change affects). */
export const NO_AFFECTED_TEST_PATTERN = /^No test files found/m

export const NO_AFFECTED_TEST_NOTE = 'no test file is affected by the change'

/** Before each line shown under a step's line (the tdd step's flags, deleted cases). */
export const STEP_DETAIL_INDENT = '        '

/** The line before the steps a green record of the same check answers: when it ran, at which HEAD. */
export const GATE_REUSED_LINE = 'reused: gate --{mode} green on this tree at {at} (HEAD {head})'

/** The verdict of a gate whose steps a green record answered. */
export const GATE_REUSED_VERDICT = 'gate --{mode}: green (reused)'

/** Before the verdict, when the tree, the install or a linked dependency changed while the steps ran. */
export const GATE_STATE_CHANGED_LINE =
	'not stored for reuse: the files, node_modules or a linked dependency changed while the steps ran'
