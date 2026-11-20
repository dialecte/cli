/**
 * `dialecte bench [--check] [--base <ref>]` - the type-instantiation cost of the change: the head (the working tree)
 * measured against the base it goes onto, both with the head's compiler on one checker, one run per scenario, per
 * version (whole program check and emit, the generated probes of `dialecte coverage`, each hand-written consumer
 * `benchmarks/types/<version>/*.ts` but `*.test-d.ts`). Library declarations are never measured (`skipLibCheck`).
 *
 * The base: `--base <ref>` (its merge-base with HEAD), else the base handed in `DIALECTE_CHANGE_BASE` (CI and contrib
 * hand it; a revision is read as its commit, anything else refused), else the order every caller shares (the store
 * lot's base read from git, else the base branch's merge-base, HEAD's own commit on the base branch, else the last
 * release tag). The base is exported at that commit into a scratch folder (no worktree registered), its siblings
 * linked, its `node_modules` the head's when they install its lock, else `npm ci`, and removed after. Nothing is
 * written in the package but its git-ignored probes.
 *
 * Each scenario is within 5% of its base, shrunk (a gain), over, new or gone. `--check` exits 1 when a row is over and
 * no `Type cost: <why>` line this change added to a changelog fragment or no-entry note explains it. Exit 2 refuses:
 * a base that cannot be read or is no commit, a lot with no base, no base in CI with `--check`, a head whose
 * `node_modules` does not install its lock, a head with no version, a tree that cannot be made or measured, method
 * discovery failing at the head with `--check`. No base outside CI and outside a lot: the head is printed alone.
 */
import { spawnSync } from 'node:child_process'

import { materializeBaseTree, removeBaseTree } from '../lib/bench/base-tree.ts'
import { judgeGrowth } from '../lib/bench/judge-growth.ts'
import { measureTree, parseCompilerVersion } from '../lib/bench/measure-tree.ts'
import { readTypeCostNotes } from '../lib/bench/type-cost-notes.ts'
import { resolveBin } from '../lib/bin.ts'
import { CHANGE_BASE_VARIABLES } from '../lib/change-base.constants.ts'
import { resolveChangeBase } from '../lib/change-base.ts'
import { resultOf } from '../lib/command-result.ts'
import { getArg, hasFlag } from '../lib/config.ts'
import { computeStateTree } from '../lib/gate-records/state-hash.ts'
import { readCommitOrNone, readHeadOrNone } from '../lib/git.ts'
import { printOut } from '../lib/print/print.ts'
import { storeLotOf } from '../lib/rules-base.ts'
import { shortCommitOf } from '../lib/tdd/tdd-base.ts'
import { checkInstallMatchesTree } from '../lib/worktree/tree-install.ts'
import {
	ABSENT_CELL,
	BASE_OPTION,
	BENCH_LINES,
	CHANGE_WIDTH,
	CI_OFF_VALUES,
	COUNT_WIDTH,
	EXIT_OVER,
	EXIT_REFUSED,
	INFINITE_CHANGE,
	SCENARIO_WIDTH,
	THRESHOLD,
	VERDICT_MARKS,
} from './bench.constants.ts'

import type { GrowthRow } from '../lib/bench/judge-growth.types.ts'
import type { Ruler, TreeCounts } from '../lib/bench/measure-tree.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { NpmRunner } from '../lib/worktree/worktree.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = await runBench({ cwd: process.cwd(), argv })
	printOut({ stream: 'stdout', text: result.output, synchronous: true })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

/**
 * `dialecte bench` in `cwd`: the head measured against the change's base, with `environment` (`DIALECTE_CHANGE_BASE`,
 * `CI`) and `install` (a base tree's install, default `npm ci`) injected.
 */
export async function runBench(params: {
	cwd: string
	argv: string[]
	/** Default: the process's environment. */
	environment?: Readonly<NodeJS.ProcessEnv>
	install?: NpmRunner
}): Promise<CommandResult> {
	const { cwd: root, argv } = params
	const environment = params.environment ?? process.env
	const check = hasFlag(argv, 'check')
	const lines: string[] = []
	function refused(refusal: string): CommandResult {
		return resultOf({ exitCode: EXIT_REFUSED, lines: [...lines, refusal] })
	}

	const install = headInstallOf({ root })
	if ('refusal' in install) return refused(install.refusal)
	lines.push(...install.lines)
	const base = benchBaseOf({ root, argv, environment, check })
	if ('refusal' in base) return refused(base.refusal)
	const ruler = rulerOf({ root })
	if ('refusal' in ruler) return refused(ruler.refusal)
	lines.push(...ruler.lines, base.line)

	const head = await measureTree({ root, argv, ruler: ruler.ruler, refuseDiscoveryFailure: check })
	if ('refusal' in head) return refused(BENCH_LINES.prefix.replace('{line}', () => head.refusal))
	if (Object.keys(head.counts).length === 0) return refused(BENCH_LINES.noTargets)
	lines.push(
		...head.discoveryFailures.map((failure) =>
			BENCH_LINES.discoveryAtHead.replace('{failure}', () => failure),
		),
	)

	const baseCounts =
		'commit' in base
			? await measureBase({
					root,
					argv,
					ruler: ruler.ruler,
					commit: base.commit,
					install: params.install,
				})
			: { counts: {}, discoveryFailures: [] }
	if ('refusal' in baseCounts)
		return refused(BENCH_LINES.prefix.replace('{line}', () => baseCounts.refusal))
	lines.push(
		...baseCounts.discoveryFailures.map((failure) =>
			BENCH_LINES.discoveryAtBase.replace('{failure}', () => failure),
		),
	)

	const rows = judgeGrowth({ base: baseCounts.counts, head: head.counts, threshold: THRESHOLD })
	const verdict = verdictOf({
		root,
		rows,
		check,
		...('commit' in base && { base: base.commit }),
		versions: Object.keys(head.counts).length,
	})
	return resultOf({
		exitCode: verdict.exitCode,
		lines: [...lines, ...tableOf(rows), ...verdict.lines],
	})
}

/**
 * The verdict lines of `rows`: each row over its base explained by the type-cost notes the change added since `base`,
 * else the line asking for one (exit 1 under `--check`); the green line under `--check` when a base was compared.
 */
function verdictOf(params: {
	root: string
	rows: readonly GrowthRow[]
	check: boolean
	base?: string
	versions: number
}): { exitCode: number; lines: string[] } {
	const { root, check, base } = params
	const over = params.rows.filter((row) => row.verdict === 'over')
	const notes = over.length && base !== undefined ? readTypeCostNotes({ root, base }) : []
	const explanation = notes.map((note) => note.text).join('; ')
	const lines = [
		'',
		...over.map((row) =>
			fillRow({ template: notes.length ? BENCH_LINES.explained : BENCH_LINES.over, row }).replace(
				'{note}',
				() => explanation,
			),
		),
	]
	const unexplained = over.length > 0 && notes.length === 0
	if (check && !unexplained && base !== undefined)
		lines.push(
			BENCH_LINES.green
				.replace('{percent}', () => String(THRESHOLD * 100))
				.replace('{versions}', () => String(params.versions)),
		)
	return { exitCode: check && unexplained ? EXIT_OVER : 0, lines }
}

/**
 * The head's install against its own lock (`checkInstallMatchesTree` of the tree it would commit): a refusal when
 * its `node_modules` does not install it; not checked, and said, when HEAD does not resolve.
 */
function headInstallOf(params: { root: string }): { lines: string[] } | { refusal: string } {
	const { root } = params
	if (readHeadOrNone(root) === undefined) return { lines: [BENCH_LINES.noCommit] }
	const refusal = checkInstallMatchesTree({ root, tree: computeStateTree(root) })
	return refusal === undefined
		? { lines: [] }
		: { refusal: BENCH_LINES.prefix.replace('{line}', () => refusal) }
}

/**
 * The commit the head is compared with and the line naming it (`resolveChangeBase`: `--base`, the handed base read as
 * a commit, the order); no base found: refused in a store lot and in CI under `--check`, else nothing compared.
 */
function benchBaseOf(params: {
	root: string
	argv: string[]
	environment: Readonly<NodeJS.ProcessEnv>
	check: boolean
}): { commit: string; line: string } | { nothing: true; line: string } | { refusal: string } {
	const { root, environment } = params
	const ref = getArg([...params.argv], BASE_OPTION)
	const handed = environment[CHANGE_BASE_VARIABLES.handed]
	const answer = resolveChangeBase({
		root,
		...(ref !== undefined && { ref }),
		...(handed !== undefined && { handed }),
		emptyTreeRequest: false,
	})
	if ('refusal' in answer)
		return { refusal: BENCH_LINES.prefix.replace('{line}', () => answer.refusal) }
	if ('unreadable' in answer)
		return { refusal: BENCH_LINES.prefix.replace('{line}', () => answer.unreadable) }
	if ('noBase' in answer) {
		if (storeLotOf({ root }) !== undefined) return { refusal: BENCH_LINES.lotWithoutBase }
		if (params.check && isCiSet(environment[CHANGE_BASE_VARIABLES.ci]))
			return { refusal: BENCH_LINES.noBaseInCi }
		return { nothing: true, line: BENCH_LINES.nothingCompared }
	}
	const commit = readCommitOrNone({ root, ref: answer.id })
	if (!commit) return { refusal: BENCH_LINES.notACommit.replace('{base}', () => answer.id) }
	if (answer.source === 'order' && answer.line !== undefined)
		return { commit, line: BENCH_LINES.prefix.replace('{line}', () => answer.line ?? '') }
	const short = shortCommitOf({ root, commit })
	return {
		commit,
		line:
			answer.source === 'flag'
				? BENCH_LINES.flagBase.replace('{short}', () => short).replace('{ref}', () => ref ?? '')
				: BENCH_LINES.handedBase.replace('{short}', () => short),
	}
}

/** Whether the CI convention is on: set, and none of the values that say it is off (`false`, `0`, empty). */
function isCiSet(value: string | undefined): boolean {
	return value !== undefined && !CI_OFF_VALUES.includes(value.trim().toLowerCase())
}

/** The head's compiler, the one both trees are measured with, and the header naming it. */
function rulerOf(params: {
	root: string
}): { ruler: Ruler; lines: string[] } | { refusal: string } {
	const { root } = params
	const tsc = resolveBin('tsc', 'typescript', root)
	if (!tsc) return { refusal: BENCH_LINES.noCompiler }
	const ran = spawnSync(tsc.path, ['--version'], { cwd: root, encoding: 'utf8' })
	const output = `${ran.stdout ?? ''}${ran.stderr ?? ''}`
	const compiler = parseCompilerVersion({ output })
	if (!compiler)
		return {
			refusal: BENCH_LINES.unreadableCompiler
				.replace('{tsc}', () => tsc.path)
				.replace('{output}', () => output.trim()),
		}
	return {
		ruler: { compiler, tsc: tsc.path },
		lines: [
			BENCH_LINES.header
				.replace('{compiler}', () => compiler.name)
				.replace('{version}', () => compiler.version),
			...(tsc.source === 'own' ? [BENCH_LINES.ownCompiler] : []),
		],
	}
}

/** The base tree made at `commit`, measured with the head's ruler, and removed whatever happens. */
async function measureBase(params: {
	root: string
	argv: string[]
	ruler: Ruler
	commit: string
	install: NpmRunner | undefined
}): Promise<{ counts: TreeCounts; discoveryFailures: string[] } | { refusal: string }> {
	const tree = materializeBaseTree({
		root: params.root,
		commit: params.commit,
		...(params.install && { install: params.install }),
	})
	if ('refusal' in tree) return tree
	try {
		return await measureTree({ root: tree.folder, argv: params.argv, ruler: params.ruler })
	} finally {
		removeBaseTree(tree)
	}
}

/** The table of every version: its scenarios with base, head, change and the mark of their verdict. */
function tableOf(rows: readonly GrowthRow[]): string[] {
	const versions = [...new Set(rows.map((row) => row.version))]
	return versions.flatMap(function versionTable(version): string[] {
		const label = `[${version}]  `
		const indent = ' '.repeat(label.length)
		return [
			'',
			`${label}| ${cellsOf(['Scenario', 'Base', 'Head', 'Change']).join(' | ')} |`,
			...rows
				.filter((row) => row.version === version)
				.map((row) =>
					`${indent}| ${cellsOf([row.scenario, countOf(row.base), countOf(row.head), changeOf(row)]).join(' | ')} | ${VERDICT_MARKS[row.verdict]}`.trimEnd(),
				),
		]
	})
}

/** The four cells of a table line, each padded to its column. */
function cellsOf(cells: readonly [string, string, string, string]): string[] {
	const widths = [SCENARIO_WIDTH, COUNT_WIDTH, COUNT_WIDTH, CHANGE_WIDTH]
	return cells.map((cell, index) => cell.padEnd(widths[index] ?? 0))
}

/** A count as printed: grouped by thousands; a side without it, the absent cell. */
function countOf(count: number | undefined): string {
	return count === undefined ? ABSENT_CELL : count.toLocaleString('en-US')
}

/** The change of a row's head from its base, in percent with its sign; none for a row with one side. */
function changeOf(row: GrowthRow): string {
	const { base, head } = row
	if (base === undefined || head === undefined) return ABSENT_CELL
	if (base === 0) return head === 0 ? '+0.0%' : INFINITE_CHANGE
	const percent = (head / base - 1) * 100
	return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`
}

/** A verdict line of `row`: its version, scenario, counts and change filled in `template`. */
function fillRow(params: { template: string; row: GrowthRow }): string {
	const { row } = params
	return params.template
		.replace('{version}', () => row.version)
		.replace('{scenario}', () => row.scenario)
		.replace('{head}', () => countOf(row.head))
		.replace('{base}', () => countOf(row.base))
		.replace('{change}', () => changeOf(row))
}
