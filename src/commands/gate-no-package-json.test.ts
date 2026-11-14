/**
 * `dialecte gate` in a repository without package.json (a Python repository): the steps inferred from its files
 * (pyproject.toml + uv.lock → `uv run pytest`) run and decide, a root dialecte.json wins over them, a repository
 * with neither is refused naming both; a package.json repository reads its package.json as before. `uv` is a
 * stand-in on PATH that counts its runs and prints a pytest summary.
 */
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

import { readRecordFile } from '../../test/gate-records.ts'
import {
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import { countingStep, countRuns, createCounter, runGateIn } from '../../test/scratch-checks.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { readModeCommandHashes } from '../lib/gate-records/mode-command-hashes.ts'
import { readPackageJson } from '../lib/package-json.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const UV_FILES = { 'pyproject.toml': '[project]\nname = "demo"\n', 'uv.lock': 'version = 1\n' }
const NOTHING_TO_RUN =
	'gate: no package.json and nothing to run: write a dialecte.json at the root ({ "gate": { "fast": [...], "full": [...] } }), or hold the files the gate infers its steps from: pyproject.toml + uv.lock (uv run pytest)'

/** A stand-in `uv` first on PATH: appends its arguments to `counter`, prints `summary`, exits with `exitCode`. */
function installUv(params: { counter: string; summary: string; exitCode: number }): void {
	const bin = temporaryFolder('dialecte-fake-uv-')
	writeFiles({
		root: bin,
		files: {
			uv: `#!/bin/sh\necho "$*" >> '${params.counter}'\necho '${params.summary}'\nexit ${params.exitCode}\n`,
		},
	})
	chmodSync(join(bin, 'uv'), 0o755)
	vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
}

/** The step lines of a gate run (`PASS  tests ...`, `FAIL  ...`), the hygiene and tdd lines left out. */
function testsLineOf(output: string): string | undefined {
	return output.split('\n').find((line) => /^\S+\s+tests\b/.test(line))
}

describe(
	'gate in a repository without package.json',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		let uvCounter: string
		beforeEach(() => {
			uvCounter = createCounter()
		})
		afterEach(() => {
			vi.unstubAllEnvs()
		})

		for (const { title, argv, summary, uvExit, exitCode, testsLine } of [
			{
				title: 'gate --fast, pyproject.toml + uv.lock, pytest green → uv run pytest once, exit 0',
				argv: ['--fast'],
				summary: '===== 3 passed in 0.10s =====',
				uvExit: 0,
				exitCode: 0,
				testsLine: /tests\b.*3 passed/,
			},
			{
				title: 'gate --full, pyproject.toml + uv.lock, pytest green → uv run pytest once, exit 0',
				argv: ['--full'],
				summary: '===== 3 passed in 0.10s =====',
				uvExit: 0,
				exitCode: 0,
				testsLine: /tests\b.*3 passed/,
			},
			{
				title:
					'gate --release, pyproject.toml + uv.lock, pytest green → the full list: uv run pytest once, exit 0',
				argv: ['--release'],
				summary: '===== 3 passed in 0.10s =====',
				uvExit: 0,
				exitCode: 0,
				testsLine: /tests\b.*3 passed/,
			},
			{
				title:
					'gate --full, pyproject.toml + uv.lock, a pytest failure → uv run pytest once, exit 1 at tests',
				argv: ['--full'],
				summary: '===== 1 failed, 2 passed in 0.10s =====',
				uvExit: 1,
				exitCode: 1,
				testsLine: /tests\b.*1 failed/,
			},
		]) {
			it(title, async () => {
				installUv({ counter: uvCounter, summary, exitCode: uvExit })
				const root = createScratchRepository({ ...UV_FILES, 'src/demo.py': 'x = 1\n' })

				const result = await runGateIn({ cwd: root, argv })

				expect({
					exitCode: result.exitCode,
					uvRuns: countRuns(uvCounter),
					notWired: result.output.includes('not wired'),
					npmScript: result.output.includes('npm script'),
				}).toEqual({ exitCode, uvRuns: 1, notWired: false, npmScript: false })
				expect(testsLineOf(result.output)).toMatch(testsLine)
			})
		}

		it('gate --full, pyproject.toml + uv.lock → its record holds the command hash every gate reader (the card) computes', async () => {
			installUv({ counter: uvCounter, summary: '===== 3 passed in 0.10s =====', exitCode: 0 })
			const root = createScratchRepository({ ...UV_FILES, 'src/demo.py': 'x = 1\n' })

			const result = await runGateIn({ cwd: root, argv: ['--full'] })

			expect(result.exitCode).toBe(0)
			expect(
				readRecordFile<{ key?: { commandHash: string } }>({ root, name: FULL_RECORD_FILE })?.key
					?.commandHash,
			).toBe(readModeCommandHashes({ root, packageJson: readPackageJson(root) }).full)
		})

		it('gate --hook, pyproject.toml + uv.lock, a staged change → uv run pytest once, exit 0', async () => {
			installUv({ counter: uvCounter, summary: '===== 3 passed in 0.10s =====', exitCode: 0 })
			const root = createScratchRepository({ ...UV_FILES, 'src/demo.py': 'x = 1\n' })
			writeFiles({ root, files: { 'src/demo.py': 'x = 2\n' } })
			git({ root, args: ['add', '-A'] })

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect({ exitCode: result.exitCode, uvRuns: countRuns(uvCounter) }).toEqual({
				exitCode: 0,
				uvRuns: 1,
			})
		})

		it('gate --full, a dialecte.json beside the uv files → its own steps run, uv never', async () => {
			installUv({ counter: uvCounter, summary: '===== 3 passed in 0.10s =====', exitCode: 0 })
			const ownCounter = createCounter()
			const own = countingStep({ counter: ownCounter, name: 'tests' })
			const root = createScratchRepository({
				...UV_FILES,
				'dialecte.json': `${JSON.stringify({ schema: 1, gate: { fast: [own], full: [own] } })}\n`,
			})

			const result = await runGateIn({ cwd: root, argv: ['--full'] })

			expect({
				exitCode: result.exitCode,
				ownRuns: countRuns(ownCounter),
				uvRuns: countRuns(uvCounter),
			}).toEqual({ exitCode: 0, ownRuns: 1, uvRuns: 0 })
		})

		for (const { argv, exitCode } of [
			{ argv: ['--fast'], exitCode: 2 },
			{ argv: ['--full'], exitCode: 2 },
			{ argv: ['--hook'], exitCode: 1 },
		]) {
			it(`gate ${argv[0]}, no package.json, no dialecte.json, nothing to infer → refused naming both, exit ${exitCode}, nothing run`, async () => {
				installUv({ counter: uvCounter, summary: '===== 3 passed in 0.10s =====', exitCode: 0 })
				const root = createScratchRepository({ 'src/demo.py': 'x = 1\n' })
				writeFiles({ root, files: { 'src/demo.py': 'x = 2\n' } })
				git({ root, args: ['add', '-A'] })

				const result = await runGateIn({ cwd: root, argv })

				expect({
					exitCode: result.exitCode,
					named: result.output.includes(NOTHING_TO_RUN),
					uvRuns: countRuns(uvCounter),
				}).toEqual({ exitCode, named: true, uvRuns: 0 })
			})
		}

		it('gate --full, a package.json beside a dialecte.json and the uv files → the package.json steps, the others unread', async () => {
			installUv({ counter: uvCounter, summary: '===== 3 passed in 0.10s =====', exitCode: 0 })
			const packageCounter = createCounter()
			const jsonCounter = createCounter()
			const fromPackage = countingStep({ counter: packageCounter, name: 'tests' })
			const fromJson = countingStep({ counter: jsonCounter, name: 'tests' })
			const root = createScratchRepository({
				...UV_FILES,
				'package.json': `${JSON.stringify({ name: 'demo', scripts: {}, dialecte: { gate: { fast: [fromPackage], full: [fromPackage] } } })}\n`,
				'dialecte.json': `${JSON.stringify({ gate: { fast: [fromJson], full: [fromJson] } })}\n`,
				'.gitignore': 'node_modules\n',
			})

			const result = await runGateIn({ cwd: root, argv: ['--full'] })

			expect({
				exitCode: result.exitCode,
				packageRuns: countRuns(packageCounter),
				jsonRuns: countRuns(jsonCounter),
				uvRuns: countRuns(uvCounter),
			}).toEqual({ exitCode: 0, packageRuns: 1, jsonRuns: 0, uvRuns: 0 })
		})
	},
)
