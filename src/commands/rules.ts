/**
 * `dialecte rules [<files...>] [--json]` - the code-rules self-check before a hand-over, on the syntax
 * tree of each file: types and constants in their own files, named functions, no `await` inside an
 * argument, object parameters, full words, no plan tag or standard citation, and in a contributor package no
 * consumer name nor word of the machine's forbidden list. Without files, the changed list a scoped gate step hands
 * (`DIALECTE_GATE_CHANGED`), else the files changed against HEAD and the new ones, that result recorded in the
 * worktree's git folder (`dialecte-rules.json`) for the hand-over card. A file it cannot read or parse is an error.
 * Exit 1 on an error; warnings alone exit 0. Run as a scoped gate step, it writes the gate's selection: the files
 * it checked.
 */
import { existsSync } from 'node:fs'

import { resultOf } from '../lib/command-result.ts'
import { hasFlag } from '../lib/config.ts'
import { GATE_SCOPE_VARIABLES } from '../lib/gate/selection.constants.ts'
import {
	readChangedPaths,
	readGateScopeEnvironment,
	writeSelectionFile,
} from '../lib/gate/selection.ts'
import { jsonOf, printOut } from '../lib/print/print.ts'
import {
	RULES_NOTHING_LINE,
	RULES_SELECTION_ID,
	RULES_SUMMARY_LINE,
} from '../lib/rules/check-rules.constants.ts'
import { checkRules, renderRuleFinding } from '../lib/rules/check-rules.ts'
import { NO_FORBIDDEN_WORDS_LINE } from '../lib/rules/forbidden-words.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { RulesCheck } from '../lib/rules/check-rules.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runRules({ cwd: process.cwd(), argv })
	// written whole before the exit: a long `--json` through a pipe is not cut at the pipe's buffer
	printOut({ stream: 'stdout', text: result.output, synchronous: true })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runRules(params: {
	cwd: string
	argv: string[]
	/** `DIALECTE_GATE_CHANGED` and the user's config folders are read from it. Default: the process's environment. */
	environment?: Readonly<NodeJS.ProcessEnv>
}): CommandResult {
	const { cwd, argv } = params
	const environment = params.environment ?? process.env
	const json = hasFlag(argv, 'json')
	const givenFiles = argv.filter((argument) => !argument.startsWith('--'))
	const changedList = givenFiles.length ? undefined : environment[GATE_SCOPE_VARIABLES.changed]
	// the gate's base alone makes the run base-aware, whatever else the gate handed
	const base = environment[GATE_SCOPE_VARIABLES.base] || undefined
	const check = checkRules({
		root: cwd,
		givenFiles,
		...(changedList !== undefined && { changedList }),
		environment,
		...(base !== undefined && { base }),
	})
	if (changedList !== undefined) writeScopedSelection({ environment, check })
	const { files, errors, warnings, findings } = check
	if (json) return { exitCode: errors ? 1 : 0, output: jsonOf(outputOf(check), 2) }
	const noList =
		check.noForbiddenWordsList === undefined
			? []
			: [NO_FORBIDDEN_WORDS_LINE.replace('{file}', check.noForbiddenWordsList)]
	const notRun = check.queryInLoopNotRun === undefined ? [] : [check.queryInLoopNotRun]
	if (files.length === 0 && findings.length === 0)
		return resultOf({ exitCode: 0, lines: [...noList, RULES_NOTHING_LINE] })
	return resultOf({
		exitCode: errors ? 1 : 0,
		lines: [
			...noList,
			...notRun,
			...findings.map(renderRuleFinding),
			RULES_SUMMARY_LINE.replace('{files}', String(files.length))
				.replace('{errors}', String(errors))
				.replace('{warnings}', String(warnings)),
		],
	})
}

/** The run as `--json` prints it: each finding without the line of its function, kept for the opt-outs only. */
function outputOf(check: RulesCheck): RulesCheck {
	return {
		...check,
		findings: check.findings.map(({ functionLine: _functionLine, ...finding }) => finding),
	}
}

/**
 * Run as a scoped gate step (every `DIALECTE_GATE_*` variable set, its changed list readable): the selection the gate
 * judges it on, the files it checked as the reasons of one id, none when it checked none.
 */
function writeScopedSelection(params: {
	environment: Readonly<NodeJS.ProcessEnv>
	check: RulesCheck
}): void {
	const scope = readGateScopeEnvironment(params.environment)
	if (scope === undefined || !existsSync(scope.changed)) return
	const { files } = params.check
	writeSelectionFile({
		scope,
		changed: readChangedPaths(scope.changed).length,
		selected: files.length ? [{ id: RULES_SELECTION_ID, reasons: files }] : [],
	})
}
