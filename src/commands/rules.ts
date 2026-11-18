/**
 * `dialecte rules [<files...>] [--json]` - the code-rules self-check before a hand-over, on the syntax
 * tree of each file: types and constants in their own files, named functions, no `await` inside an
 * argument, object parameters, full words, no plan tag or standard citation, and in a contributor package no
 * consumer name nor word of the machine's forbidden list. Without files, the changed list a scoped gate step hands
 * (`DIALECTE_GATE_CHANGED`), else the files changed against HEAD and the new ones, that result recorded in the
 * worktree's git folder (`dialecte-rules.json`) for the hand-over card. A file it cannot read or parse is an error.
 * In an app (a package that is no core, dialecte, create nor cli package, and no contributor's), only the script
 * files that are Dialecte changes are judged, the others counted in one line; `--json` gives each checked file its
 * verdict (`dialecteChanges`). The test rules (spliced or replaced XML, spies on a transaction, acts that repeat the
 * call or compare a captured state, long documents, test and fixture files) judge test-shaped Dialecte changes only.
 * The gate's base (`DIALECTE_GATE_BASE`) makes an error on a line the change did not add a warning; without it, the
 * run takes the order every caller shares (the store lot's base read from git, else the base branch's merge-base with HEAD,
 * skipped when it is HEAD's commit, else the last release tag `<name>@v<version>` reachable from HEAD, else no base and
 * every error kept: a run on the base branch itself takes that tag, else keeps every error) and names it in one line
 * (`baseLine`).
 * Not judged: act-repeats-call counts a call after an early-return arm that makes the same call as two; a
 * `*Query`-named binding that is no query, or a run with no readable API index (no core groups), can make a unit of a
 * call chain.
 * Exit 1 on an error; warnings alone exit 0. Run as a scoped gate step, it writes the gate's selection: the files
 * it checked.
 */
import { existsSync } from 'node:fs'

import { resultOf } from '../lib/command-result.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { readEmptyTree, resolveFlagBase } from '../lib/gate/gate-base.ts'
import { GATE_SCOPE_VARIABLES } from '../lib/gate/selection.constants.ts'
import {
	readChangedPaths,
	readGateScopeEnvironment,
	writeSelectionFile,
} from '../lib/gate/selection.ts'
import { jsonOf, printOut } from '../lib/print/print.ts'
import { QUALITY_LINES } from '../lib/quality/quality.constants.ts'
import { resolveRulesBaseSource } from '../lib/rules-base.ts'
import {
	RULES_NOTHING_LINE,
	RULES_SELECTION_ID,
	RULES_SUMMARY_LINE,
} from '../lib/rules/check-rules.constants.ts'
import { checkRules, renderRuleFinding } from '../lib/rules/check-rules.ts'
import { NOT_JUDGED_LINE } from '../lib/rules/dialecte-change.constants.ts'
import { NO_FORBIDDEN_WORDS_LINE } from '../lib/rules/forbidden-words.constants.ts'
import { readBaseWithLine } from '../lib/rules/lot-base.ts'
import { shortCommitOf } from '../lib/tdd/tdd-base.ts'
import { BASE_OPTION, RULES_BASE_WITH_FILES } from './rules.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { QualityBase } from '../lib/quality/quality.types.ts'
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
	const environment = params.environment ?? process.env
	const run = checkOfRun({ cwd: params.cwd, argv: params.argv, environment })
	if ('refusal' in run) return resultOf({ exitCode: 2, lines: [run.refusal] })
	const { check } = run
	if (run.scoped) writeScopedSelection({ environment, check })
	if (hasFlag(params.argv, 'json'))
		return { exitCode: check.errors ? 1 : 0, output: jsonOf(outputOf(check), 2) }
	return textOf(check)
}

/**
 * The rules run `argv` asks for in `cwd`, or why it refuses: `--base <ref>` (its merge-base, else the commit it names)
 * judges the change since it, never files given with it; else the gate's base, else the order every caller shares,
 * each with its line, and the base the base-aware rules judge against with theirs.
 */
function checkOfRun(params: {
	cwd: string
	argv: string[]
	environment: Readonly<NodeJS.ProcessEnv>
}): { check: RulesCheck; scoped: boolean } | { refusal: string } {
	const { cwd, argv, environment } = params
	const givenFiles = positionalArguments({ argv, valueOptions: [BASE_OPTION] })
	const flagRef = getArg([...argv], BASE_OPTION)
	// `--base <ref>` judges the change since the merge-base of ref and HEAD: never a list of files given with it
	if (flagRef !== undefined && givenFiles.length) return { refusal: RULES_BASE_WITH_FILES }
	const flag =
		flagRef === undefined ? undefined : resolveFlagBase({ root: cwd, ref: flagRef, head: 'HEAD' })
	if (flag !== undefined && 'refusal' in flag) return { refusal: flag.refusal }
	const changedList =
		givenFiles.length || flag !== undefined ? undefined : environment[GATE_SCOPE_VARIABLES.changed]
	// the flag, else the gate's base, wins; without either, the base of the order every caller shares, with its line
	const gateBase = flag?.commit ?? (environment[GATE_SCOPE_VARIABLES.base] || undefined)
	const ownBase = gateBase === undefined ? readBaseWithLine({ root: cwd }) : undefined
	const base = gateBase ?? (ownBase !== undefined && 'base' in ownBase ? ownBase.base : undefined)
	const quality = qualityBaseOf({
		root: cwd,
		flag: flag?.commit,
		scoped: changedList !== undefined,
	})
	// an empty-tree gate base (gate --release) goes through the order too: a lot base it cannot read is said, never silent
	const noBaseLine =
		gateBase !== undefined && gateBase === readEmptyTree(cwd)
			? noBaseLineOf({ root: cwd })
			: undefined
	const runBaseLine = ownBase?.line ?? noBaseLine
	const checked = checkRules({
		root: cwd,
		givenFiles,
		...(changedList !== undefined && { changedList }),
		environment,
		...(base !== undefined && { base }),
		...(flag !== undefined && { since: flag.commit }),
		...('base' in quality && { quality: quality.base }),
		...(environment[GATE_SCOPE_VARIABLES.tree] && { tree: environment[GATE_SCOPE_VARIABLES.tree] }),
	})
	return {
		check: {
			...checked,
			...(runBaseLine !== undefined && { baseLine: runBaseLine }),
			qualityLine: quality.line,
		},
		scoped: changedList !== undefined,
	}
}

/** The run as text: its base and quality lines, the notes, each finding, the summary (or the nothing line). */
function textOf(check: RulesCheck): CommandResult {
	const { files, errors, warnings, findings } = check
	const noList =
		check.noForbiddenWordsList === undefined
			? []
			: [NO_FORBIDDEN_WORDS_LINE.replace('{file}', check.noForbiddenWordsList)]
	const notRun = [check.queryInLoopNotRun, check.releasedChangelogNotJudged].filter(
		(line) => line !== undefined,
	)
	const baseLine = [
		...(check.baseLine === undefined ? [] : [check.baseLine]),
		...(check.qualityLine === undefined ? [] : [check.qualityLine]),
	]
	const notJudged =
		check.notJudged === undefined
			? []
			: [NOT_JUDGED_LINE.replace('{count}', String(check.notJudged))]
	if (files.length === 0 && findings.length === 0)
		return resultOf({ exitCode: 0, lines: [...baseLine, ...noList, RULES_NOTHING_LINE] })
	return resultOf({
		exitCode: errors ? 1 : 0,
		lines: [
			...baseLine,
			...noList,
			...notRun,
			...findings.map(renderRuleFinding),
			...notJudged,
			RULES_SUMMARY_LINE.replace('{files}', String(files.length))
				.replace('{errors}', String(errors))
				.replace('{warnings}', String(warnings)),
		],
	})
}

/**
 * The base the base-aware rules judge the change against, with the line naming it: `--base`, else the order's lot base,
 * else (a bare run only) its base-branch merge-base; a scoped gate step outside any lot (a hand-over or rehearsal clone)
 * runs none, nor a run the order gives no lot base (a release tag, nothing, a lot base it cannot read).
 */
function qualityBaseOf(params: {
	root: string
	flag: string | undefined
	scoped: boolean
}): { base: QualityBase; line: string } | { line: string } {
	const { root } = params
	if (params.flag !== undefined)
		return withLine({ root, base: { commit: params.flag, source: 'flag' } })
	const order = resolveRulesBaseSource({ root, emptyTreeRequest: true })
	if (order !== undefined && !('failure' in order)) {
		if (order.source === 'lot')
			return withLine({ root, base: { commit: order.commit, source: 'lot' } })
		if (order.source === 'base-branch' && !params.scoped)
			return withLine({ root, base: { commit: order.commit, source: 'base-branch' } })
	}
	// a lot whose base cannot be read is no clone: its run says no base, as its base line says why
	const unreadable = order !== undefined && 'failure' in order
	return { line: params.scoped && !unreadable ? QUALITY_LINES.noLot : QUALITY_LINES.noBase }
}

/** `base` with its line: `quality: since <short> (<source>)`. */
function withLine(params: { root: string; base: QualityBase }): {
	base: QualityBase
	line: string
} {
	const short = shortCommitOf({ root: params.root, commit: params.base.commit })
	return {
		base: params.base,
		line: QUALITY_LINES.since
			.replace('{short}', () => short)
			.replace('{source}', () => params.base.source),
	}
}

/** The line saying why there is no base, when the order finds the worktree's lot base unreadable; else none. */
function noBaseLineOf(params: { root: string }): string | undefined {
	const read = readBaseWithLine(params)
	return read === undefined || 'base' in read ? undefined : read.line
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
