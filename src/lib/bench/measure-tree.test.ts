import {
	checkerArgs,
	isolatedTsconfig,
	parseCompilerVersion,
	parseTscMetrics,
	wholeProgramArgs,
} from './measure-tree.ts'

import { describe, expect, it } from 'vitest'

import type { Compiler } from './measure-tree.types.ts'

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
		expect(parseTscMetrics(SAMPLE)).toEqual({
			Instantiations: 115109,
			Types: 99123,
			Symbols: 327797,
		})
	})
	it('omits metrics absent from the output', () => {
		expect(parseTscMetrics('Instantiations: 10\n')).toEqual({ Instantiations: 10 })
	})
})

// The bench measures what a dialecte's own types cost. The declaration files of its libraries
// (core, dexie, sax, whatever comes next) are skipped, so a library's own typing - or a library
// error that stops the check early - never moves the numbers.
describe('library declarations are not measured', () => {
	it('skips them in the per-file configuration, whatever the project configuration says', () => {
		expect(isolatedTsconfig({ tsconfig: 'tsconfig.build.json', file: 'bench/a.ts' })).toMatchObject(
			{
				extends: './tsconfig.build.json',
				compilerOptions: { skipLibCheck: true },
				include: ['bench/a.ts'],
			},
		)
	})
	it('skips them in both whole-program runs', () => {
		expect([
			wholeProgramArgs({ tsconfig: 'tsconfig.build.json', mode: 'check' }).includes(
				'--skipLibCheck',
			),
			wholeProgramArgs({ tsconfig: 'tsconfig.build.json', mode: 'emit' }).includes(
				'--skipLibCheck',
			),
		]).toEqual([true, true])
	})
})

const TSGO: Compiler = { name: 'tsgo', version: '7.0.2' }
const TSC: Compiler = { name: 'tsc', version: '6.0.2' }

// A fake compiler: its count is the type work of the files, plus, when it checks with several
// checkers, a share per file (each checker instantiates the shared types again), as tsgo does.
function fakeCompiler(params: { typeWork: number; files: number }): (args: string[]) => number {
	const { typeWork, files } = params
	return function countOf(args) {
		const at = args.indexOf('--checkers')
		const checkers = at === -1 ? 4 : Number(args[at + 1])
		return typeWork + (checkers > 1 ? files * 700 : 0)
	}
}

describe('one checker: a file set gives one count', () => {
	const cases = [
		{ name: 'the file set', files: 40, count: 129_295 },
		{ name: 'the file set and one trivial file', files: 41, count: 129_295 },
	]
	it.each(cases)('$name -> the count of its type work only', ({ files, count }) => {
		expect(
			fakeCompiler({ typeWork: 129_295, files })([
				'-p',
				'tsconfig.json',
				...checkerArgs({ compiler: TSGO }),
			]),
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
