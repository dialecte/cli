/**
 * The measure of one tree (the head's working tree or an exported base tree): per version and scenario, the counts of
 * one compiler run on one checker, the compiler the ruler names, run with the tree as its folder.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { generateTargetCoverage } from '../../commands/coverage.ts'
import { resolveTargets, tsconfigOf } from '../config.ts'
import { tailOf } from '../progress/tail-of.ts'
import {
	CONSUMER_EXTENSION,
	EMIT_FOLDER,
	ISOLATED_TSCONFIG_NAME,
	MEASURE_REFUSALS,
	METRICS,
	NATIVE_COMPILER_MAJOR,
	PROBE_SCENARIOS,
	SCENARIOS,
	SINGLE_CHECKER_ARGS,
	TYPE_TEST_EXTENSION,
} from './measure-tree.constants.ts'

import type { Target } from '../config.types.ts'
import type { Compiler, Counts, Ruler, TreeCounts, TreeMeasure } from './measure-tree.types.ts'

/**
 * The configuration a single bench file is compiled with: the project's, for that file alone, every library
 * declaration file skipped (`skipLibCheck`): the bench measures what the dialecte's own types cost, so neither a
 * library's own typing nor a library error that stops the check early moves the numbers.
 */
export function isolatedTsconfig(params: { tsconfig: string; file: string }): {
	extends: string
	compilerOptions: Record<string, boolean | string>
	include: string[]
} {
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

/** The `tsc` arguments of a whole-program run, type-check only or with declaration emit; library declarations skipped. */
export function wholeProgramArgs(params: { tsconfig: string; mode: 'check' | 'emit' }): string[] {
	const { tsconfig, mode } = params
	const output =
		mode === 'check' ? ['--noEmit'] : ['--emitDeclarationOnly', '--outDir', EMIT_FOLDER]
	return ['-p', tsconfig, ...output, '--skipLibCheck', '--extendedDiagnostics']
}

/** The counts a `tsc --extendedDiagnostics` dump holds; a count it lacks is left out. */
export function parseTscMetrics(output: string): Partial<Counts> {
	const counts: Partial<Counts> = {}
	for (const metric of METRICS) {
		const match = new RegExp(`${metric}:\\s+(\\d+)`).exec(output)
		if (match) counts[metric] = Number(match[1])
	}
	return counts
}

/** The compiler named by a `tsc --version` line (`Version 7.0.2`), or undefined when there is none. */
export function parseCompilerVersion(params: { output: string }): Compiler | undefined {
	const version = /Version\s+(\d+)\.(\S+)/.exec(params.output)
	if (!version) return undefined
	const name = Number(version[1]) >= NATIVE_COMPILER_MAJOR ? 'tsgo' : 'tsc'
	return { name, version: `${version[1]}.${version[2]}` }
}

/** The arguments that pin a compiler to one checker: `--checkers 1` for tsgo, none for tsc. */
export function checkerArgs(params: { compiler: Compiler }): string[] {
	return params.compiler.name === 'tsgo' ? [...SINGLE_CHECKER_ARGS] : []
}

/**
 * The counts of the tree at `root`: its own targets and tsconfig, its probes generated in it, each scenario measured
 * once with `ruler`; a tree with no target has no counts. A version whose method discovery fails has no
 * `coverage: api` scenario, the failure returned; with `refuseDiscoveryFailure`, nothing is measured and it is refused.
 * A version whose probes cannot be generated (its constants do not load) or a run that gives no count is refused.
 */
export async function measureTree(params: {
	root: string
	argv: string[]
	ruler: Ruler
	refuseDiscoveryFailure?: boolean
}): Promise<TreeMeasure | { refusal: string }> {
	const { root, argv, ruler } = params
	const targets = resolveTargets(argv, root)
	if (!targets.length) return { counts: {}, discoveryFailures: [] }
	const tsconfig = tsconfigOf(argv, root)
	const discoveryFailures: string[] = []
	for (const target of targets) {
		const probes = await generateProbes({ root, target, tsconfig })
		if ('refusal' in probes) return probes
		if (probes.discoveryFailure !== undefined) discoveryFailures.push(probes.discoveryFailure)
	}
	if (params.refuseDiscoveryFailure && discoveryFailures.length)
		return { refusal: discoveryFailures.join('; ') }
	const whole: Record<string, Counts> = {}
	for (const mode of ['check', 'emit'] as const) {
		const counts = runCounts({ root, ruler, args: wholeProgramArgs({ tsconfig, mode }) })
		rmSync(join(root, EMIT_FOLDER), { recursive: true, force: true })
		if ('refusal' in counts)
			return refusalOf({ scenario: SCENARIOS[mode], refusal: counts.refusal })
		whole[SCENARIOS[mode]] = counts
	}
	const counts: TreeCounts = {}
	for (const target of targets) {
		const version: Record<string, Counts> = { ...whole }
		for (const [scenario, file] of scenarioFilesOf({ root, target })) {
			const measured = measureFile({ root, ruler, tsconfig, file })
			if ('refusal' in measured) return refusalOf({ scenario, refusal: measured.refusal })
			version[scenario] = measured
		}
		counts[target.version] = version
	}
	return { counts, discoveryFailures }
}

/** The probes of `target` written in the tree; its discovery failure named; a refusal when they cannot be written. */
async function generateProbes(params: {
	root: string
	target: Target
	tsconfig: string
}): Promise<{ discoveryFailure?: string } | { refusal: string }> {
	const { target } = params
	try {
		const { discoveryFailure } = await generateTargetCoverage(params)
		if (discoveryFailure === undefined) return {}
		return {
			discoveryFailure: MEASURE_REFUSALS.discovery
				.replace('{version}', () => target.version)
				.replace('{reason}', () => discoveryFailure),
		}
	} catch (error) {
		return {
			refusal: MEASURE_REFUSALS.probes
				.replace('{version}', () => target.version)
				.replace('{reason}', () => (error instanceof Error ? error.message : String(error))),
		}
	}
}

/** The scenarios of `target` that have a file in the tree, each with its file relative to the tree. */
function scenarioFilesOf(params: { root: string; target: Target }): [string, string][] {
	const { root, target } = params
	const probes = Object.entries(PROBE_SCENARIOS).map(([scenario, name]): [string, string] => [
		scenario,
		join(target.outDir, name),
	])
	const versionFolder = dirname(target.outDir)
	const consumers = existsSync(join(root, versionFolder))
		? readdirSync(join(root, versionFolder))
				.filter((name) => name.endsWith(CONSUMER_EXTENSION) && !name.endsWith(TYPE_TEST_EXTENSION))
				.map((name): [string, string] => [
					SCENARIOS.consumer.replace('{name}', () => name.slice(0, -CONSUMER_EXTENSION.length)),
					join(versionFolder, name),
				])
		: []
	return [...probes, ...consumers].filter(([, file]) => existsSync(join(root, file)))
}

/** One file measured on its own, through a configuration written beside the tree's and removed after. */
function measureFile(params: {
	root: string
	ruler: Ruler
	tsconfig: string
	file: string
}): Counts | { refusal: string } {
	const { root, ruler, tsconfig, file } = params
	const name = ISOLATED_TSCONFIG_NAME.replace('{file}', () => file.replace(/[/.]/g, '_'))
	const path = join(root, name)
	writeFileSync(path, JSON.stringify(isolatedTsconfig({ tsconfig, file })))
	try {
		return runCounts({ root, ruler, args: ['-p', name, '--extendedDiagnostics'] })
	} finally {
		rmSync(path, { force: true })
	}
}

/** One run of the ruler's compiler in the tree on one checker: its three counts, or the run's last line. */
function runCounts(params: {
	root: string
	ruler: Ruler
	args: string[]
}): Counts | { refusal: string } {
	const { root, ruler } = params
	const ran = spawnSync(ruler.tsc, [...params.args, ...checkerArgs({ compiler: ruler.compiler })], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 1e8,
	})
	const output = `${ran.stdout ?? ''}${ran.stderr ?? ''}`
	const counts = parseTscMetrics(output)
	if (
		counts.Instantiations === undefined ||
		counts.Types === undefined ||
		counts.Symbols === undefined
	)
		return { refusal: tailOf({ output, lines: 1 }).trim() }
	return { Instantiations: counts.Instantiations, Types: counts.Types, Symbols: counts.Symbols }
}

/** The refusal of a scenario that gave no count. */
function refusalOf(params: { scenario: string; refusal: string }): { refusal: string } {
	return {
		refusal: MEASURE_REFUSALS.noCount
			.replace('{scenario}', () => params.scenario)
			.replace('{output}', () => params.refusal),
	}
}
