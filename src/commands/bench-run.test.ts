import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../test/scratch-repository.ts'
import { run } from './bench.ts'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

// The compiler is faked by a script in the package's node_modules/.bin: it logs its arguments, answers
// `--version` with tsgo 7.0.2, and any other run with a fixed --extendedDiagnostics dump.
const FAKE_TSC = `#!/bin/sh
printf '%s\\n' "$*" >> "$(dirname "$0")/../../tsc-args.log"
case "$1" in
	--version) echo "Version 7.0.2" ;;
	*) printf 'Instantiations: 100\\nTypes: 10\\nSymbols: 5\\n' ;;
esac
`
const BASELINE = 'benchmarks/types/baseline.json'
const made: string[] = []

function makeCorePackage(params: { baseline: string | undefined }): string {
	const root = temporaryFolder('bench-run-')
	made.push(root)
	writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@dialecte/core' }))
	writeFileSync(join(root, 'tsconfig.json'), '{}')
	mkdirSync(join(root, 'node_modules/.bin'), { recursive: true })
	writeFileSync(join(root, 'node_modules/.bin/tsc'), FAKE_TSC)
	chmodSync(join(root, 'node_modules/.bin/tsc'), 0o755)
	if (params.baseline != null) {
		mkdirSync(join(root, 'benchmarks/types'), { recursive: true })
		writeFileSync(join(root, BASELINE), params.baseline)
	}
	vi.spyOn(process, 'cwd').mockReturnValue(root)
	vi.spyOn(process, 'exit').mockImplementation((code) => {
		throw new Error(`exit ${code}`)
	})
	return root
}

function compilerRuns(root: string): string[] {
	return readFileSync(join(root, 'tsc-args.log'), 'utf8')
		.trim()
		.split('\n')
		.filter((line) => line !== '--version')
}

afterEach(() => {
	vi.restoreAllMocks()
})

// Every package folder a test made is gone once its test ended.
afterAll(() => {
	expect(made.filter((root) => existsSync(root))).toEqual([])
})

describe('bench run: one checker, a compiler-stamped baseline', () => {
	it('writes the compiler and one checker into the baseline', async () => {
		const root = makeCorePackage({ baseline: undefined })
		await run(['--no-format'])
		expect(JSON.parse(readFileSync(join(root, BASELINE), 'utf8'))).toMatchObject({
			compiler: { name: 'tsgo', version: '7.0.2' },
			checkers: 1,
		})
	})
	it('runs every measure of tsgo with one checker', async () => {
		const root = makeCorePackage({ baseline: undefined })
		await run(['--no-format'])
		expect(compilerRuns(root).filter((args) => !args.endsWith('--checkers 1'))).toEqual([])
	})
})

describe('bench --check: no verdict without a comparable baseline', () => {
	const results = { 'whole-program (check)': { Instantiations: 100 } }
	const cases = [
		{
			name: 'a baseline from another version',
			baseline: JSON.stringify({ compiler: { name: 'tsgo', version: '7.0.1' }, results }),
			exit: 'exit 3',
		},
		{
			name: 'a baseline that records no compiler',
			baseline: JSON.stringify({ results }),
			exit: 'exit 3',
		},
		{ name: 'no baseline', baseline: undefined, exit: 'exit 2' },
	]
	it.each(cases)('$name -> $exit, nothing measured or written', async ({ baseline, exit }) => {
		const root = makeCorePackage({ baseline })
		await expect(run(['--check', '--no-format'])).rejects.toThrow(exit)
		expect({
			measured: compilerRuns(root),
			baseline: existsSync(join(root, BASELINE))
				? readFileSync(join(root, BASELINE), 'utf8')
				: undefined,
		}).toEqual({ measured: [], baseline })
	})
})
