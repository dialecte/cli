/**
 * `dialecte bench [--check]` — measure type-instantiation cost (tsc --extendedDiagnostics),
 * PER discovered version. Scenarios per version (under benchmarks/types/<version>/):
 *   whole-program check + emit (package-level, measured once), the generated baseline/surface/calls,
 *   and any hand-written consumer *.ts (e.g. kitchen-sink.ts; excluding *.test-d.ts).
 * Library declaration files are never measured (`skipLibCheck`): only the dialecte's own types count.
 * Writes/【--check】compares benchmarks/types/<version>/baseline.json. RUNS env (default 3); MIN kept.
 * tsgo (TypeScript 7+) runs with one checker (`--checkers 1`): with several, the count shifts with the
 * file set. The baseline records the compiler and its version; `--check` refuses (exit 3) a baseline
 * of another compiler or version, or one that records none, before measuring anything.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

import { resolveBin } from '../lib/bin.ts'
import { hasFlag, resolveTargets, tsconfigOf } from '../lib/config.ts'
import { formatFiles, formatOptsFromArgv } from '../lib/format.ts'
import { printLines } from '../lib/print/print.ts'
import {
	EXIT_COMPILER_MISMATCH,
	METRICS,
	NATIVE_COMPILER_MAJOR,
	RE_BASELINE,
	SINGLE_CHECKER_ARGS,
	STABLE_METRICS,
	THRESHOLD,
} from './bench.constants.ts'

import type { Target } from '../lib/config.types.ts'
import type { Compiler, CompilerComparison, Metrics, RunCompiler } from './bench.types.ts'

/**
 * The configuration a single bench file is compiled with: the project's, for that file alone.
 *
 * `skipLibCheck` whatever the project says: the bench measures what the dialecte's own types cost.
 * Every declaration file is skipped - core, dexie, sax and any library added later - so neither a
 * library's own typing nor a library error that stops the check early moves the numbers. Types a
 * dialecte uses from a library are still instantiated, and counted, where the dialecte uses them.
 */
export function isolatedTsconfig(params: { tsconfig: string; file: string }) {
	const { tsconfig, file } = params
	return {
		extends: `./${tsconfig}`,
		compilerOptions: {
			noEmit: true,
			skipLibCheck: true,
			rootDir: '.',
			declaration: false,
			declarationMap: false,
			emitDeclarationOnly: false,
		},
		include: [file],
	}
}

/** The `tsc` arguments of a whole-program run, type-check only or with declaration emit; library
 * declarations skipped as in `isolatedTsconfig`. */
export function wholeProgramArgs(params: { tsconfig: string; mode: 'check' | 'emit' }): string[] {
	const { tsconfig, mode } = params
	const output =
		mode === 'check' ? ['--noEmit'] : ['--emitDeclarationOnly', '--outDir', '.bench-dts']
	return ['-p', tsconfig, ...output, '--skipLibCheck', '--extendedDiagnostics']
}

/** Parse a `tsc --extendedDiagnostics` dump into the metrics we track. Missing metrics are omitted. */
export function parseTscMetrics(output: string): Metrics {
	const metrics: Metrics = {}
	for (const metric of METRICS) {
		const match = output.match(
			new RegExp(`${metric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s+([\\d.]+)`),
		)
		if (match) metrics[metric] = Number(match[1])
	}
	return metrics
}

/** The compiler named by a `tsc --version` line (`Version 7.0.2`), or undefined when there is none. */
export function parseCompilerVersion(params: { output: string }): Compiler | undefined {
	const version = params.output.match(/Version\s+(\d+)\.(\S+)/)
	if (!version) return undefined
	const name = Number(version[1]) >= NATIVE_COMPILER_MAJOR ? 'tsgo' : 'tsc'
	return { name, version: `${version[1]}.${version[2]}` }
}

/** The arguments that pin a compiler to one checker: `--checkers 1` for tsgo, none for tsc. */
export function checkerArgs(params: { compiler: Compiler }): string[] {
	return params.compiler.name === 'tsgo' ? SINGLE_CHECKER_ARGS : []
}

/** Run the compiler `runs` times on one checker and keep the minimum per metric. */
export function measureRuns(params: {
	runCompiler: RunCompiler
	compiler: Compiler
	args: string[]
	runs: number
}): Metrics {
	const { runCompiler, compiler, args, runs } = params
	const pinned = [...args, ...checkerArgs({ compiler })]
	return aggregateRuns(Array.from({ length: runs }, () => runCompiler(pinned)))
}

/** Whether a baseline recorded with `baseline` can be compared with a run of `measured`. */
export function compareCompiler(params: {
	baseline: Compiler | undefined
	measured: Compiler
}): CompilerComparison {
	const { baseline, measured } = params
	const measuredWith = `measured with ${compilerLabel({ compiler: measured })}: ${RE_BASELINE}`
	if (!baseline) return { kind: 'refused', line: `baseline records no compiler, ${measuredWith}` }
	if (baseline.name === measured.name && baseline.version === measured.version)
		return { kind: 'comparable' }
	return {
		kind: 'refused',
		line: `baseline from ${compilerLabel({ compiler: baseline })}, ${measuredWith}`,
	}
}

function compilerLabel(params: { compiler: Compiler }): string {
	return `${params.compiler.name} ${params.compiler.version}`
}

/** Reduce repeated runs to the best (min) value per metric — drops timing noise. */
export function aggregateRuns(runs: Metrics[]): Metrics {
	const best: Metrics = {}
	for (const metric of METRICS) {
		const values = runs.map((run) => run[metric]).filter((value): value is number => value != null)
		if (values.length) best[metric] = Math.min(...values)
	}
	return best
}

/** True when `current` regresses past `baseline` by more than `threshold` (e.g. 0.05 = 5%). */
export function checkRegression(params: {
	current: number | undefined
	baseline: number | undefined
	threshold?: number
}): boolean {
	const { current, baseline, threshold = THRESHOLD } = params
	return baseline != null && current != null && current > baseline * (1 + threshold)
}

/** Keep only the deterministic metrics per scenario — exactly what is persisted to baseline.json. */
export function stableResults(results: Record<string, Metrics>): Record<string, Metrics> {
	return Object.fromEntries(
		Object.entries(results).map(([scenario, metrics]) => [
			scenario,
			Object.fromEntries(
				STABLE_METRICS.filter((metric) => metrics[metric] != null).map((metric) => [
					metric,
					metrics[metric],
				]),
			),
		]),
	)
}

/** The compiler a `--version` output names; a bench that cannot tell which compiler runs stops. */
function readCompiler(params: { tsc: string; output: string }): Compiler {
	const { tsc, output } = params
	const compiler = parseCompilerVersion({ output })
	if (!compiler)
		throw new Error(`bench: cannot read the compiler version from ${tsc}: ${output.trim()}`)
	return compiler
}

function baselinePathOf(params: { root: string; versionDir: string }): string {
	return join(params.root, params.versionDir, 'baseline.json')
}

/**
 * A baseline from another compiler or version holds counts of another measure: `--check` names every
 * such baseline and exits before measuring anything.
 */
function refuseForeignBaselines(params: { root: string; targets: Target[]; compiler: Compiler }) {
	const { root, targets, compiler } = params
	const refusals = targets.flatMap((target) => {
		const versionDir = dirname(target.outDir)
		const prior = JSON.parse(readFileSync(baselinePathOf({ root, versionDir }), 'utf8'))
		const comparison = compareCompiler({ baseline: prior.compiler, measured: compiler })
		return comparison.kind === 'refused' ? [`✗ [${target.version}] ${comparison.line}`] : []
	})
	if (!refusals.length) return
	printLines({ stream: 'stderr', lines: refusals })
	process.exit(EXIT_COMPILER_MISMATCH)
}

export async function run(argv: string[]): Promise<void> {
	const ROOT = process.cwd()
	const tsc = resolveBin('tsc', 'typescript', ROOT)
	if (!tsc) throw new Error('bench: no TypeScript compiler found (project nor @dialecte/cli).')
	if (tsc.source === 'own')
		printLines({
			stream: 'stderr',
			lines: [
				"  ⚠ using @dialecte/cli's own tsc — counts may differ from the project's pinned TypeScript",
			],
		})
	const TSC = tsc.path
	const RUNS = Number(process.env.RUNS || 3)
	const CHECK = hasFlag(argv, 'check')
	const tsconfig = tsconfigOf(argv)
	const targets = resolveTargets(argv)
	if (!targets.length)
		throw new Error(
			'bench: no versions discovered. Run `dialecte coverage` first, or pass --constants-dir.',
		)

	function runTsc(args: string[]): string {
		const result = spawnSync(TSC, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 })
		return `${result.stdout || ''}${result.stderr || ''}`
	}
	const compiler = readCompiler({ tsc: TSC, output: runTsc(['--version']) })
	if (CHECK) refuseForeignBaselines({ root: ROOT, targets, compiler })

	function runMetrics(args: string[]): Metrics {
		return parseTscMetrics(runTsc(args))
	}
	function measure(args: string[]): Metrics {
		return measureRuns({
			runCompiler: runMetrics,
			compiler,
			args,
			runs: RUNS,
		})
	}
	function isolated(file: string): string {
		const name = `.bench-${file.replace(/[/.]/g, '_')}.tsconfig.json`
		writeFileSync(join(ROOT, name), JSON.stringify(isolatedTsconfig({ tsconfig, file })))
		return name
	}
	function measureFile(file: string): Metrics {
		const tmp = isolated(file)
		const metrics = measure(['-p', tmp, '--extendedDiagnostics'])
		rmSync(join(ROOT, tmp), { force: true })
		return metrics
	}

	function pad(params: { value: unknown; width: number }): string {
		return String(params.value).padEnd(params.width)
	}
	function formatCount(count: number | undefined): string {
		return count == null ? '—' : Math.round(count).toLocaleString('en-US')
	}

	// Whole-program is package-level → measure once, share across versions.
	printLines({
		stream: 'stdout',
		lines: [
			`bench — ${compiler.name} ${compiler.version}, one checker, ${RUNS} runs (min) — whole program …`,
		],
	})
	const wholeCheck = measure(wholeProgramArgs({ tsconfig, mode: 'check' }))
	const wholeEmit = measure(wholeProgramArgs({ tsconfig, mode: 'emit' }))
	rmSync(join(ROOT, '.bench-dts'), { recursive: true, force: true })

	let failed = false
	for (const target of targets) {
		const versionDir = dirname(target.outDir) // e.g. ./benchmarks/types/v2019C1
		const results: Record<string, Metrics> = {
			'whole-program (check)': wholeCheck,
			'whole-program (emit)': wholeEmit,
		}
		function addIfPresent(key: string, relativePath: string) {
			if (existsSync(join(ROOT, relativePath))) {
				printLines({ stream: 'stdout', lines: [`  [${target.version}] ${key} …`] })
				results[key] = measureFile(relativePath)
			}
		}
		addIfPresent('baseline (import)', `${target.outDir}/baseline.ts`)
		addIfPresent('coverage: surface', `${target.outDir}/coverage.surface.generated.ts`)
		addIfPresent('coverage: calls', `${target.outDir}/coverage.calls.generated.ts`)
		addIfPresent('coverage: deep', `${target.outDir}/coverage.deep.generated.ts`)
		addIfPresent('coverage: api', `${target.outDir}/coverage.api.generated.ts`)
		if (existsSync(join(ROOT, versionDir)))
			for (const fileName of readdirSync(join(ROOT, versionDir)))
				if (fileName.endsWith('.ts') && !fileName.endsWith('.test-d.ts'))
					addIfPresent(`consumer: ${fileName.replace(/\.ts$/, '')}`, `${versionDir}/${fileName}`)

		const table = [
			'',
			`[${target.version}]  | ${pad({ value: 'Scenario', width: 26 })} | ${pad({ value: 'Instantiations', width: 14 })} | ${pad({ value: 'Check', width: 7 })} |`,
			...Object.entries(results).map(
				([key, metrics]) =>
					`           | ${pad({ value: key, width: 26 })} | ${pad({ value: formatCount(metrics.Instantiations), width: 14 })} | ${pad({ value: `${metrics['Check time'] ?? '?'}s`, width: 7 })} |`,
			),
		]
		const baseline = results['baseline (import)']?.Instantiations
		if (baseline != null)
			for (const [key, metrics] of Object.entries(results))
				if (key.startsWith('coverage:') || key.startsWith('consumer:'))
					table.push(
						`             ${pad({ value: key, width: 26 })} +${formatCount((metrics.Instantiations ?? 0) - baseline)}`,
					)
		printLines({ stream: 'stdout', lines: table })

		const baselinePath = baselinePathOf({ root: ROOT, versionDir })
		if (CHECK) {
			const prior = JSON.parse(readFileSync(baselinePath, 'utf8'))
			for (const [key, metrics] of Object.entries(results)) {
				const base = prior.results?.[key]?.Instantiations
				if (checkRegression({ current: metrics.Instantiations, baseline: base })) {
					printLines({
						stream: 'stderr',
						lines: [
							`❌ [${target.version}] ${key}: ${formatCount(metrics.Instantiations)} > baseline ${formatCount(base)} (+${((metrics.Instantiations / base - 1) * 100).toFixed(1)}%)`,
						],
					})
					failed = true
				}
			}
		} else {
			mkdirSync(join(ROOT, versionDir), { recursive: true })
			// Persist deterministic metrics only, tab-indented to match the house oxfmt style — robust
			// even when oxfmt is absent; formatFiles then normalises it (a no-op when already clean).
			writeFileSync(
				baselinePath,
				`${JSON.stringify({ tool: 'dialecte bench', version: target.version, compiler, checkers: 1, runs: RUNS, results: stableResults(results) }, null, '\t')}\n`,
			)
			formatFiles({ root: ROOT, files: [baselinePath], options: formatOptsFromArgv(argv) })
			printLines({ stream: 'stdout', lines: [`  wrote ${versionDir}/baseline.json`] })
		}
	}
	if (CHECK) {
		if (failed) process.exit(1)
		printLines({
			stream: 'stdout',
			lines: [
				'',
				`✅ No instantiation regression > ${THRESHOLD * 100}% across ${targets.length} version(s).`,
			],
		})
	}
}
