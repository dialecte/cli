import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import {
	CLI_HELP_TIMEOUT,
	LEGACY_RECORDS_FILE,
	RECORDS_FILE,
	SCOPE_FILE,
} from '../../test/mutation-package.constants.ts'
import {
	mutationPackage,
	parsedOutput,
	recordablePackage,
	runMutantsIn,
	storedRuns,
} from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { startRun } from '../lib/mutation/run-store.ts'
import { run } from './mutants.ts'

import { beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'

const TREE = 'c'.repeat(40)

/** The exit code and the JSON value of a verb run with `--json`. */
async function jsonRun(params: { root: string; argv: string[] }) {
	const { exitCode, output } = await runMutantsIn(params)
	return { exitCode, json: parsedOutput(output) }
}

describe('mutants schedule --json', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('scheduled keys → { verb, ok, followUp, scheduled }', async () => {
		const root = recordablePackage()

		await expect(
			jsonRun({ root, argv: ['schedule', 'guard-cleanup', 'n1', 'n2', '--json'] }),
		).resolves.toEqual({
			exitCode: 0,
			json: { verb: 'schedule', ok: true, followUp: 'guard-cleanup', scheduled: ['n1', 'n2'] },
		})
	})

	it('--all-new → every new key listed', async () => {
		const root = recordablePackage()

		await expect(
			jsonRun({ root, argv: ['schedule', 'guard-cleanup', '--all-new', '--json'] }),
		).resolves.toMatchObject({
			exitCode: 0,
			json: {
				verb: 'schedule',
				ok: true,
				followUp: 'guard-cleanup',
				scheduled: expect.arrayContaining(['n1', 'n2', 'n3', 'n4']),
			},
		})
	})

	it('an unknown key → { verb, ok: false, reason }, exit 1', async () => {
		await expect(
			jsonRun({ root: recordablePackage(), argv: ['schedule', 'guard-cleanup', 'nope', '--json'] }),
		).resolves.toMatchObject({
			exitCode: 1,
			json: { verb: 'schedule', ok: false, reason: expect.stringContaining('nope') },
		})
	})

	it('a usage error found after --json → { verb, ok: false, reason }, exit 2', async () => {
		await expect(
			jsonRun({ root: recordablePackage(), argv: ['schedule', '--json'] }),
		).resolves.toMatchObject({
			exitCode: 2,
			json: { verb: 'schedule', ok: false, reason: expect.any(String) },
		})
	})
})

describe('mutants abandon --json', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a died run → { verb, ok, runId }', async () => {
		const root = mutationPackage()
		const { runId } = startRun({ root, pid: deadPid(), lot: 'lot-a', tree: TREE, mode: 'changed' })

		await expect(jsonRun({ root, argv: ['abandon', runId, '--json'] })).resolves.toEqual({
			exitCode: 0,
			json: { verb: 'abandon', ok: true, runId },
		})
		expect(storedRuns(root)).toEqual([expect.objectContaining({ runId, state: 'abandoned' })])
	})

	it('a running run → { verb, ok: false, reason }, exit 1', async () => {
		const root = mutationPackage()
		const { runId } = startRun({
			root,
			pid: process.pid,
			lot: 'lot-a',
			tree: TREE,
			mode: 'changed',
		})

		await expect(jsonRun({ root, argv: ['abandon', runId, '--json'] })).resolves.toMatchObject({
			exitCode: 1,
			json: { verb: 'abandon', ok: false, reason: expect.stringContaining(runId) },
		})
	})

	it('a usage error found after --json → { verb, ok: false, reason }, exit 2', async () => {
		await expect(
			jsonRun({ root: mutationPackage(), argv: ['abandon', '--json'] }),
		).resolves.toMatchObject({
			exitCode: 2,
			json: { verb: 'abandon', ok: false, reason: expect.any(String) },
		})
	})
})

describe('mutants migrate --json', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const LEGACY = {
		[SCOPE_FILE]: {
			k1: {
				line: 2,
				mutation: 'ConditionalExpression: x === 1 -> true',
				equivalent: 'a ref always has an id',
			},
		},
	}

	it('the legacy records → { verb, ok, path, written }', async () => {
		const root = mutationPackage()
		writeFiles({ root, files: { [LEGACY_RECORDS_FILE]: `${JSON.stringify(LEGACY)}\n` } })

		await expect(jsonRun({ root, argv: ['migrate', '--json'] })).resolves.toEqual({
			exitCode: 0,
			json: { verb: 'migrate', ok: true, path: RECORDS_FILE, written: 1 },
		})
	})

	it('no legacy file → { verb, ok: false, reason }, exit 1', async () => {
		await expect(
			jsonRun({ root: mutationPackage(), argv: ['migrate', '--json'] }),
		).resolves.toMatchObject({
			exitCode: 1,
			json: {
				verb: 'migrate',
				ok: false,
				reason: expect.stringContaining('equivalent-mutants.json'),
			},
		})
	})
})

describe('mutants usage', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it.each(['schedule', 'abandon', 'migrate', 'judge', 'record', 'drop'])(
		'the usage text lists %s with [--json]',
		async (verb) => {
			await expect(runMutantsIn({ root: mutationPackage(), argv: [] })).resolves.toMatchObject({
				exitCode: 2,
				output: expect.stringMatching(new RegExp(`mutants ${verb}[^\\n]*\\[--json\\]`)),
			})
		},
	)
})

describe('the cli help of mutants', { timeout: CLI_HELP_TIMEOUT }, () => {
	let help: { status: number | null; lines: string[] }

	beforeAll(function printHelpOnce() {
		const result = spawnSync(
			process.execPath,
			[join(import.meta.dirname, '..', 'cli.ts'), 'mutants', '--help'],
			{
				encoding: 'utf8',
				timeout: CLI_HELP_TIMEOUT,
			},
		)
		help = { status: result.status, lines: result.stdout.split('\n') }
	})

	it.each(['schedule', 'abandon', 'migrate', 'judge', 'record', 'drop'])(
		'names mutants %s with [--json]',
		(verb) => {
			expect(help.status).toBe(0)
			expect(help.lines.find((line) => line.includes(`dialecte mutants ${verb}`))).toContain(
				'[--json]',
			)
		},
	)

	it('the mutants section names judge, record and drop', () => {
		expect(help.status).toBe(0)
		expect(help.lines.filter((line) => /^\s*dialecte mutants\b/.test(line)).join('\n')).toMatch(
			/judge[\s\S]*record[\s\S]*drop/,
		)
	})
})

describe(
	'the mutants command of the bin prints a --json result with console.log',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** Runs `run(argv)` inside the package, with console and process.exit watched; restored when the test ends. */
		function watchedRun(params: { root: string; argv: string[] }) {
			const original = process.cwd()
			process.chdir(params.root)
			const log = vi.spyOn(console, 'log').mockImplementation(() => {})
			const error = vi.spyOn(console, 'error').mockImplementation(() => {})
			const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
				throw new Error(`exit ${code}`)
			}) as never)
			onTestFinished(function restore() {
				process.chdir(original)
				log.mockRestore()
				error.mockRestore()
				exit.mockRestore()
			})
			return { log, error, finished: () => run(params.argv) }
		}

		it('a success → one console.log of the JSON object, nothing on stderr', async () => {
			const watched = watchedRun({
				root: recordablePackage(),
				argv: ['schedule', 'later', 'n1', '--json'],
			})

			await expect(watched.finished()).resolves.toBeUndefined()
			expect(watched.error).not.toHaveBeenCalled()
			expect(watched.log).toHaveBeenCalledTimes(1)
			expect(parsedOutput(String(watched.log.mock.calls[0][0]))).toEqual({
				verb: 'schedule',
				ok: true,
				followUp: 'later',
				scheduled: ['n1'],
			})
		})

		it('a refusal → still one console.log of the JSON object (not stderr), then the exit code', async () => {
			const watched = watchedRun({
				root: recordablePackage(),
				argv: ['schedule', 'later', 'nope', '--json'],
			})

			await expect(watched.finished()).rejects.toThrow('exit 1')
			expect(watched.error).not.toHaveBeenCalled()
			expect(watched.log).toHaveBeenCalledTimes(1)
			expect(parsedOutput(String(watched.log.mock.calls[0][0]))).toMatchObject({
				verb: 'schedule',
				ok: false,
				reason: expect.stringContaining('nope'),
			})
		})
	},
)
