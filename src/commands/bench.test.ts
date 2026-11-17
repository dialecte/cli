import { STABLE_METRICS } from './bench.constants.ts'
import {
	aggregateRuns,
	checkerArgs,
	checkRegression,
	compareCompiler,
	measureRuns,
	parseCompilerVersion,
	isolatedTsconfig,
	parseTscMetrics,
	stableResults,
	wholeProgramArgs,
} from './bench.ts'

import { describe, expect, it } from 'vitest'

import type { Compiler, CompilerComparison } from './bench.types.ts'

const SAMPLE = `
Files:              120
Instantiations:  115109
Types:            99123
Symbols:         327797
Memory used:   338523K
Check time:       1.02s
Total time:       1.32s
`

describe('parseTscMetrics', () => {
	it('extracts every tracked metric from a --extendedDiagnostics dump', () => {
		const metrics = parseTscMetrics(SAMPLE)
		expect(metrics.Instantiations).toBe(115109)
		expect(metrics.Types).toBe(99123)
		expect(metrics.Symbols).toBe(327797)
		expect(metrics['Check time']).toBe(1.02)
	})
	it('omits metrics absent from the output', () => {
		const metrics = parseTscMetrics('Instantiations: 10\n')
		expect(metrics.Instantiations).toBe(10)
		expect(metrics.Types).toBeUndefined()
	})
})

describe('aggregateRuns', () => {
	it('keeps the minimum value per metric across runs', () => {
		const best = aggregateRuns([
			{ Instantiations: 1000 },
			{ Instantiations: 800 },
			{ Instantiations: 900 },
		])
		expect(best.Instantiations).toBe(800)
	})
})

describe('checkRegression', () => {
	it('passes at exactly the threshold and fails just beyond it', () => {
		expect(checkRegression({ current: 1050, baseline: 1000, threshold: 0.05 })).toBe(false)
		expect(checkRegression({ current: 1051, baseline: 1000, threshold: 0.05 })).toBe(true)
	})
	it('never reports a regression when a value is missing', () => {
		expect(checkRegression({ current: undefined, baseline: 1000 })).toBe(false)
		expect(checkRegression({ current: 1000, baseline: undefined })).toBe(false)
	})
})

describe('stableResults', () => {
	it('persists only the deterministic metrics (drops timing + memory)', () => {
		const stable = stableResults({
			s: { Instantiations: 1, Types: 2, Symbols: 3, 'Check time': 9, 'Memory used': 9 },
		})
		expect(Object.keys(stable.s)).toEqual([...STABLE_METRICS])
		expect(stable.s['Check time']).toBeUndefined()
		expect(stable.s['Memory used']).toBeUndefined()
	})
})

// The bench measures what a dialecte's own types cost. The declaration files of its libraries
// (core, dexie, sax, whatever comes next) are skipped, so a library's own typing - or a library
// error that stops the check early - never moves the numbers.
describe('library declarations are not measured', () => {
	it('skips them in the per-file configuration, whatever the project configuration says', () => {
		const config = isolatedTsconfig({ tsconfig: 'tsconfig.build.json', file: 'bench/a.ts' })
		expect(config.compilerOptions.skipLibCheck).toBe(true)
		expect(config.extends).toBe('./tsconfig.build.json')
		expect(config.include).toEqual(['bench/a.ts'])
	})
	it('skips them in both whole-program runs', () => {
		expect(wholeProgramArgs({ tsconfig: 'tsconfig.build.json', mode: 'check' })).toContain(
			'--skipLibCheck',
		)
		expect(wholeProgramArgs({ tsconfig: 'tsconfig.build.json', mode: 'emit' })).toContain(
			'--skipLibCheck',
		)
	})
})

const TSGO: Compiler = { name: 'tsgo', version: '7.0.2' }
const TSC: Compiler = { name: 'tsc', version: '6.0.2' }

// A fake compiler: its count is the type work of the files, plus, when it checks with several
// checkers, a share per file (each checker instantiates the shared types again), as tsgo does.
function fakeCompiler(params: { typeWork: number; files: number }) {
	const { typeWork, files } = params
	return (args: string[]) => {
		const at = args.indexOf('--checkers')
		const checkers = at === -1 ? 4 : Number(args[at + 1])
		return { Instantiations: typeWork + (checkers > 1 ? files * 700 : 0) }
	}
}

describe('one checker: a file set gives one count', () => {
	const cases = [
		{ name: 'the file set', files: 40, count: 129_295 },
		{ name: 'the file set and one trivial file', files: 41, count: 129_295 },
	]
	it.each(cases)('$name -> the count of its type work only', ({ files, count }) => {
		expect(
			measureRuns({
				runCompiler: fakeCompiler({ typeWork: 129_295, files }),
				compiler: TSGO,
				args: ['-p', 'tsconfig.json'],
				runs: 3,
			}).Instantiations,
		).toBe(count)
	})
})

describe('checkerArgs', () => {
	const cases = [
		{ name: 'tsgo', compiler: TSGO, args: ['--checkers', '1'] },
		{ name: 'a TypeScript 6 compiler', compiler: TSC, args: [] },
	]
	it.each(cases)('$name -> $args', ({ compiler, args }) => {
		expect(checkerArgs({ compiler })).toEqual(args)
	})
})

describe('parseCompilerVersion', () => {
	const cases = [
		{ output: 'Version 7.0.2\n', compiler: { name: 'tsgo', version: '7.0.2' } },
		{ output: 'Version 6.0.2\n', compiler: { name: 'tsc', version: '6.0.2' } },
		{
			output: 'Version 7.1.0-dev.20261101\n',
			compiler: { name: 'tsgo', version: '7.1.0-dev.20261101' },
		},
		{ output: 'command not found\n', compiler: undefined },
	]
	it.each(cases)('$output -> $compiler', ({ output, compiler }) => {
		expect(parseCompilerVersion({ output })).toEqual(compiler)
	})
})

describe('compareCompiler', () => {
	const cases = [
		{ name: 'the same compiler and version', baseline: TSGO, comparison: { kind: 'comparable' } },
		{
			name: 'another patch version',
			baseline: { name: 'tsgo', version: '7.0.1' },
			comparison: {
				kind: 'refused',
				line: 'baseline from tsgo 7.0.1, measured with tsgo 7.0.2: re-baseline in its own commit',
			},
		},
		{
			name: 'another compiler',
			baseline: TSC,
			comparison: {
				kind: 'refused',
				line: 'baseline from tsc 6.0.2, measured with tsgo 7.0.2: re-baseline in its own commit',
			},
		},
		{
			name: 'no compiler recorded',
			baseline: undefined,
			comparison: {
				kind: 'refused',
				line: 'baseline records no compiler, measured with tsgo 7.0.2: re-baseline in its own commit',
			},
		},
	] satisfies { name: string; baseline: Compiler | undefined; comparison: CompilerComparison }[]
	it.each(cases)('$name', ({ baseline, comparison }) => {
		expect(compareCompiler({ baseline, measured: TSGO })).toEqual(comparison)
	})
})
