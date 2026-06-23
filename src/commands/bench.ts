/**
 * `dialecte bench [--check]` — measure type-instantiation cost (tsc --extendedDiagnostics),
 * PER discovered version. Scenarios per version (under benchmarks/types/<version>/):
 *   whole-program check + emit (package-level, measured once), the generated baseline/surface/calls,
 *   and any hand-written consumer *.ts (e.g. kitchen-sink.ts; excluding *.test-d.ts).
 * Writes/【--check】compares benchmarks/types/<version>/baseline.json. RUNS env (default 3); MIN kept.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

import { resolveBin } from '../lib/bin.ts'
import { hasFlag, resolveTargets, tsconfigOf } from '../lib/config.ts'
import { formatFiles, formatOptsFromArgv } from '../lib/format.ts'

export type Metrics = Record<string, number>
export const METRICS = [
	'Instantiations',
	'Types',
	'Symbols',
	'Memory used',
	'Check time',
	'Total time',
]
// Deterministic metrics only — these are what get persisted to the committed baseline. Timing
// ('Check time'/'Total time') and 'Memory used' vary run-to-run, so persisting them would churn
// the baseline on every `bench`; the --check gate compares Instantiations regardless.
export const STABLE_METRICS = ['Instantiations', 'Types', 'Symbols']
export const THRESHOLD = 0.05

/** Parse a `tsc --extendedDiagnostics` dump into the metrics we track. Missing metrics are omitted. */
export function parseTscMetrics(output: string): Metrics {
	const m: Metrics = {}
	for (const metric of METRICS) {
		const match = output.match(
			new RegExp(`${metric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s+([\\d.]+)`),
		)
		if (match) m[metric] = Number(match[1])
	}
	return m
}

/** Reduce repeated runs to the best (min) value per metric — drops timing noise. */
export function aggregateRuns(runs: Metrics[]): Metrics {
	const best: Metrics = {}
	for (const metric of METRICS) {
		const vals = runs.map((r) => r[metric]).filter((v): v is number => v != null)
		if (vals.length) best[metric] = Math.min(...vals)
	}
	return best
}

/** True when `current` regresses past `baseline` by more than `threshold` (e.g. 0.05 = 5%). */
export function checkRegression(
	current: number | undefined,
	baseline: number | undefined,
	threshold: number = THRESHOLD,
): boolean {
	return baseline != null && current != null && current > baseline * (1 + threshold)
}

/** Keep only the deterministic metrics per scenario — exactly what is persisted to baseline.json. */
export function stableResults(results: Record<string, Metrics>): Record<string, Metrics> {
	return Object.fromEntries(
		Object.entries(results).map(([k, m]) => [
			k,
			Object.fromEntries(STABLE_METRICS.filter((s) => m[s] != null).map((s) => [s, m[s]])),
		]),
	)
}

export async function run(argv: string[]): Promise<void> {
	const ROOT = process.cwd()
	const tsc = resolveBin('tsc', 'typescript', ROOT)
	if (!tsc) throw new Error('bench: no TypeScript compiler found (project nor @dialecte/cli).')
	if (tsc.source === 'own')
		console.warn(
			"  ⚠ using @dialecte/cli's own tsc — counts may differ from the project's pinned TypeScript",
		)
	const TSC = tsc.path
	const RUNS = Number(process.env.RUNS || 3)
	const CHECK = hasFlag(argv, 'check')
	const tsconfig = tsconfigOf(argv)
	const targets = resolveTargets(argv)
	if (!targets.length)
		throw new Error(
			'bench: no versions discovered. Run `dialecte coverage` first, or pass --constants-dir.',
		)

	const runTsc = (args: string[]): Metrics => {
		const res = spawnSync(TSC, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 })
		return parseTscMetrics(`${res.stdout || ''}${res.stderr || ''}`)
	}
	const measure = (args: string[]): Metrics =>
		aggregateRuns(Array.from({ length: RUNS }, () => runTsc(args)))
	const isolated = (file: string): string => {
		const name = `.bench-${file.replace(/[/.]/g, '_')}.tsconfig.json`
		writeFileSync(
			join(ROOT, name),
			JSON.stringify({
				extends: `./${tsconfig}`,
				compilerOptions: {
					noEmit: true,
					rootDir: '.',
					declaration: false,
					declarationMap: false,
					emitDeclarationOnly: false,
				},
				include: [file],
			}),
		)
		return name
	}
	const measureFile = (file: string): Metrics => {
		const tmp = isolated(file)
		const m = measure(['-p', tmp, '--extendedDiagnostics'])
		rmSync(join(ROOT, tmp), { force: true })
		return m
	}

	const col = (s: unknown, w: number) => String(s).padEnd(w)
	const num = (n: number | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'))

	// Whole-program is package-level → measure once, share across versions.
	console.log(`bench — ${RUNS} runs (min) — whole program …`)
	const wholeCheck = measure(['-p', tsconfig, '--noEmit', '--extendedDiagnostics'])
	const wholeEmit = measure([
		'-p',
		tsconfig,
		'--emitDeclarationOnly',
		'--outDir',
		'.bench-dts',
		'--extendedDiagnostics',
	])
	rmSync(join(ROOT, '.bench-dts'), { recursive: true, force: true })

	let failed = false
	for (const t of targets) {
		const versionDir = dirname(t.outDir) // e.g. ./benchmarks/types/v2019C1
		const results: Record<string, Metrics> = {
			'whole-program (check)': wholeCheck,
			'whole-program (emit)': wholeEmit,
		}
		const add = (key: string, rel: string) => {
			if (existsSync(join(ROOT, rel))) {
				process.stdout.write(`  [${t.version}] ${key} …\n`)
				results[key] = measureFile(rel)
			}
		}
		add('baseline (import)', `${t.outDir}/baseline.ts`)
		add('coverage: surface', `${t.outDir}/coverage.surface.generated.ts`)
		add('coverage: calls', `${t.outDir}/coverage.calls.generated.ts`)
		add('coverage: deep', `${t.outDir}/coverage.deep.generated.ts`)
		add('coverage: api', `${t.outDir}/coverage.api.generated.ts`)
		if (existsSync(join(ROOT, versionDir)))
			for (const f of readdirSync(join(ROOT, versionDir)))
				if (f.endsWith('.ts') && !f.endsWith('.test-d.ts'))
					add(`consumer: ${f.replace(/\.ts$/, '')}`, `${versionDir}/${f}`)

		console.log(
			`\n[${t.version}]  | ${col('Scenario', 26)} | ${col('Instantiations', 14)} | ${col('Check', 7)} |`,
		)
		for (const [key, m] of Object.entries(results))
			console.log(
				`           | ${col(key, 26)} | ${col(num(m.Instantiations), 14)} | ${col(`${m['Check time'] ?? '?'}s`, 7)} |`,
			)
		const baseline = results['baseline (import)']?.Instantiations
		if (baseline != null)
			for (const [key, m] of Object.entries(results))
				if (key.startsWith('coverage:') || key.startsWith('consumer:'))
					console.log(`             ${col(key, 26)} +${num((m.Instantiations ?? 0) - baseline)}`)

		const baselinePath = join(ROOT, versionDir, 'baseline.json')
		if (CHECK) {
			const prior = JSON.parse(readFileSync(baselinePath, 'utf8'))
			for (const [key, m] of Object.entries(results)) {
				const base = prior.results?.[key]?.Instantiations
				if (checkRegression(m.Instantiations, base)) {
					console.error(
						`❌ [${t.version}] ${key}: ${num(m.Instantiations)} > baseline ${num(base)} (+${((m.Instantiations / base - 1) * 100).toFixed(1)}%)`,
					)
					failed = true
				}
			}
		} else {
			mkdirSync(join(ROOT, versionDir), { recursive: true })
			// Persist deterministic metrics only, tab-indented to match the house oxfmt style — robust
			// even when oxfmt is absent; formatFiles then normalises it (a no-op when already clean).
			writeFileSync(
				baselinePath,
				`${JSON.stringify({ tool: 'dialecte bench', version: t.version, runs: RUNS, results: stableResults(results) }, null, '\t')}\n`,
			)
			formatFiles(ROOT, [baselinePath], formatOptsFromArgv(argv))
			console.log(`  wrote ${versionDir}/baseline.json`)
		}
	}
	if (CHECK) {
		if (failed) process.exit(1)
		console.log(
			`\n✅ No instantiation regression > ${THRESHOLD * 100}% across ${targets.length} version(s).`,
		)
	}
}
