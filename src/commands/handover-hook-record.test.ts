/** `handover run`: a commit's hook result recorded as a gate record of the tree it ran on, and read by the card. */

import { chmodSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { ISO_TIME_PATTERN, SHA256_PATTERN } from '../../test/gate-records.constants.ts'
import { gitPathOf, readRecordFile } from '../../test/gate-records.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import { FAILING_HOOK_LINES, PASSING_HOOK_LINES } from '../../test/hook-output-lines.constants.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { runHandover, runHandoverRun } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'
import type { LotsFile } from '../lib/handover/handover.types.ts'

/** Scratch repositories, git, a hook and a clone per case: the bound leaves room on a loaded machine. */
const SCRATCH_REPOSITORY_TIMEOUT = HANDOVER_CASE_TIMEOUT

/** The record a commit's hook leaves in the git folder of the repository it commits in. */
const HOOK_RECORD = 'dialecte-gate-hook.json'

/** The card's gate lines of the steps a hook names, and the line said when no gate record exists. */
const HOOK_STEP_LINE = /^[✓!✗] (gate|check|test:run|build)\b/

function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** A shell command printing each line as given. */
function printLines(lines: readonly string[]): string {
	return `printf '%s\\n' ${lines.map((line) => `'${line.replaceAll("'", "'\\''")}'`).join(' ')}`
}

/**
 * A repository with two changed files in one lot, the hand-over written; its pre-commit hook `script` in
 * `.husky/_` (as husky installs it), or no hook at all when `script` is undefined.
 */
function prepare(script: string | undefined): { root: string; out: string } {
	const root = createScratchRepository({ 'src/read.ts': 'export function read() {}\n' })
	writeFiles({ root, files: { '.gitignore': '.husky/_\nnode_modules\n' } })
	git({ root, args: ['add', '.gitignore'] })
	git({ root, args: ['commit', '-q', '-m', 'chore: ignore the hooks folder'] })
	if (script !== undefined) {
		mkdirSync(join(root, '.husky/_'), { recursive: true })
		writeFileSync(join(root, '.husky/_/pre-commit'), `#!/bin/sh\n${script}\n`)
		chmodSync(join(root, '.husky/_/pre-commit'), 0o755)
		git({ root, args: ['config', 'core.hooksPath', '.husky/_'] })
	}
	writeFiles({
		root,
		files: {
			'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
			'CHANGELOG.md': '# Changelog\n\n- read answers 1\n',
		},
	})
	const out = temporaryFolder('dialecte-handover-')
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head: headOf(root),
		gates: 'npm run check',
		lots: [{ paths: ['src/', 'CHANGELOG.md'], message: 'feat(read): read answers one' }],
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	expect(
		runHandover({
			argv: [lotsPath],
			cliPath: '/opt/dialecte/dist/cli.js',
			probe: noRepositoryCli,
		}).exitCode,
	).toBe(0)
	return { root, out }
}

/** `handover run` on the folder, every line it printed kept. */
async function runFolder(params: {
	out: string
	argv?: string[]
	scratchRoot?: string
}): Promise<{ exitCode: number; text: string }> {
	const lines: string[] = []
	removeHookLogs({ lines })
	const exitCode = await runHandoverRun({
		probe: noRepositoryCli,
		argv: [params.out, ...(params.argv ?? [])],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: params.scratchRoot ?? temporaryFolder('dialecte-scratch-root-'),
	})
	return { exitCode, text: lines.join('\n') }
}

/**
 * The card's gate lines, wherever its layout puts them: `<mark> <name> <detail>`, the box, a row label
 * and the padding left out, runs of spaces as one.
 */
function gateLinesOf(output: string): string[] {
	return output.split('\n').flatMap(function gateLine(line) {
		const match = /^│\s+(?:gates\s+)?([✓!✗] \S.*?)\s*│$/.exec(line)
		return match ? [match[1].replace(/ {2,}/g, ' ')] : []
	})
}

describe(
	'handover run: the hook result as a gate record',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a hook passing (check, test:run with 1214 tests, build) → dialecte-gate-hook.json in the git folder: mode hook, head the new commit, the state hash of the tree before the commit, the steps the summary names, passed, with their counts', async () => {
			const { root, out } = prepare(printLines(PASSING_HOOK_LINES))
			const stateBefore = computeStateHash(root)

			const result = await runFolder({ out })

			const record = readRecordFile<GateRecord>({ root, name: HOOK_RECORD })
			expect(result.exitCode).toBe(0)
			expect(record).toEqual({
				mode: 'hook',
				at: expect.stringMatching(ISO_TIME_PATTERN),
				head: headOf(root),
				stateHash: stateBefore,
				key: {
					tree: expect.stringMatching(/^[0-9a-f]{40}$/),
					lockHash: 'none',
					commandHash: expect.stringMatching(SHA256_PATTERN),
					linked: expect.stringMatching(SHA256_PATTERN),
				},
				steps: [
					expect.objectContaining({ name: 'check', status: 'passed' }),
					expect.objectContaining({
						name: 'test:run',
						status: 'passed',
						counts: expect.objectContaining({
							tests: { passed: 1214, failed: 0, skipped: 0, total: 1214 },
						}),
					}),
					expect.objectContaining({ name: 'build', status: 'passed' }),
				],
			})
			expect(record?.stateHash).toMatch(SHA256_PATTERN)
		})

		it('a hook passing → the card after the run reads it: ✓ check commit hook, ✓ test:run 1214/1214 · commit hook, ✓ build commit hook; no gate never run line', async () => {
			const { out } = prepare(printLines(PASSING_HOOK_LINES))

			const result = await runFolder({ out })

			expect(result.exitCode).toBe(0)
			expect(gateLinesOf(result.text).filter((line) => HOOK_STEP_LINE.test(line))).toEqual([
				'✓ check commit hook',
				'✓ test:run 1214/1214 · commit hook',
				'✓ build commit hook',
			])
		})

		it('a hook failing in test:run → a record too, head still the base, check and test:run failed; the card after the stopped run shows them ✗, ending with commit hook', async () => {
			const { root, out } = prepare(`${printLines(FAILING_HOOK_LINES)}; exit 1`)
			const base = headOf(root)

			const result = await runFolder({ out })

			const record = readRecordFile<GateRecord>({ root, name: HOOK_RECORD })
			expect(result.exitCode).toBe(1)
			expect(record).toMatchObject({
				mode: 'hook',
				head: base,
				steps: [
					{ name: 'check', status: 'failed' },
					{
						name: 'test:run',
						status: 'failed',
						counts: { tests: { passed: 1213, failed: 1, skipped: 0, total: 1214 } },
					},
				],
			})
			expect(gateLinesOf(result.text).filter((line) => HOOK_STEP_LINE.test(line))).toEqual([
				expect.stringMatching(/^✗ check\b.* commit hook$/),
				expect.stringMatching(/^✗ test:run 1213 passed · 1 failed\b.* · commit hook$/),
			])
		})

		it('an older fast gate record of the same tree (lint passed, build failed) → the card takes the latest record of each step: ✓ lint from the gate, ✓ build commit hook from the hook', async () => {
			const { root, out } = prepare(printLines(['', '> demo@1.0.0 build', '> tsup']))
			const fastRecord: GateRecord = {
				mode: 'fast',
				at: '2026-01-01T00:00:00.000Z',
				head: headOf(root),
				stateHash: computeStateHash(root),
				steps: [
					{ name: 'lint', status: 'passed', counts: {} },
					{ name: 'build', status: 'failed', counts: {}, reason: 'exited 1' },
				],
			}
			writeFileSync(
				gitPathOf({ root, name: 'dialecte-gate-fast.json' }),
				`${JSON.stringify(fastRecord, null, 2)}\n`,
			)

			const result = await runFolder({ out })

			expect(result.exitCode).toBe(0)
			expect(gateLinesOf(result.text).filter((line) => /^[✓!✗] (lint|build)\b/.test(line))).toEqual(
				['✓ lint', '✓ build commit hook'],
			)
		})

		it('a fast gate record newer than the hook record (build failed there) → the gate supersedes the whole hook record: ✗ build from the gate, no commit hook line', async () => {
			const { root, out } = prepare(
				printLines([
					'',
					'> demo@1.0.0 test:run',
					'> vitest run',
					'      Tests  4 passed (4)',
					'',
					'> demo@1.0.0 build',
					'> tsup',
				]),
			)
			const fastRecord: GateRecord = {
				mode: 'fast',
				at: '2999-01-01T00:00:00.000Z',
				head: headOf(root),
				stateHash: computeStateHash(root),
				steps: [{ name: 'build', status: 'failed', counts: {}, reason: 'exited 1' }],
			}
			writeFileSync(
				gitPathOf({ root, name: 'dialecte-gate-fast.json' }),
				`${JSON.stringify(fastRecord, null, 2)}\n`,
			)

			const result = await runFolder({ out })

			expect(result.exitCode).toBe(0)
			expect(
				gateLinesOf(result.text).filter((line) => /^[✓!✗] (test:run|build)\b/.test(line)),
			).toEqual(['✗ build exited 1'])
			expect(gateLinesOf(result.text).filter((line) => line.endsWith('commit hook'))).toEqual([])
		})

		it('a hook record, then the tree changes and a newer gate passes on it → the next hand-over card is READY with no commit hook line', async () => {
			const { root, out } = prepare(
				printLines(['', '> demo@1.0.0 test:run', '> vitest run', '      Tests  4 passed (4)']),
			)
			const first = await runFolder({ out })
			expect(first.exitCode).toBe(0)
			writeFiles({ root, files: { 'src/write.ts': 'export function write() {}\n' } })
			const fastRecord: GateRecord = {
				mode: 'fast',
				at: '2999-01-01T00:00:00.000Z',
				head: headOf(root),
				stateHash: computeStateHash(root),
				steps: [{ name: 'check', status: 'passed', counts: {} }],
			}
			writeFileSync(
				gitPathOf({ root, name: 'dialecte-gate-fast.json' }),
				`${JSON.stringify(fastRecord, null, 2)}\n`,
			)
			const next = temporaryFolder('dialecte-handover-')
			const lotsPath = join(next, 'lots.json')
			const lotsFile: LotsFile = {
				repository: root,
				branch: 'main',
				head: headOf(root),
				lots: [{ paths: ['src/write.ts'], message: 'feat(write): write' }],
			}
			writeFileSync(lotsPath, JSON.stringify(lotsFile))

			const written = runHandover({
				argv: [lotsPath],
				cliPath: '/opt/dialecte/dist/cli.js',
				probe: noRepositoryCli,
			})

			expect(written.exitCode).toBe(0)
			expect(gateLinesOf(written.output).filter((line) => line.endsWith('commit hook'))).toEqual([])
			expect(gateLinesOf(written.output).filter((line) => line.includes('changed since'))).toEqual(
				[],
			)
			expect(written.output).toMatch(/│ READY /)
		})

		it('a hook that writes a file while it runs → its record holds the tree before the commit: the card says (the tree changed since)', async () => {
			const { root, out } = prepare(
				[
					printLines(['', '> demo@1.0.0 test:run', '> vitest run', '      Tests  4 passed (4)']),
					`printf 'export const written = 1\\n' > "$(git rev-parse --show-toplevel)/src/written.ts"`,
				].join('; '),
			)
			const stateBefore = computeStateHash(root)

			const result = await runFolder({ out })

			expect(result.exitCode).toBe(0)
			expect(readRecordFile<GateRecord>({ root, name: HOOK_RECORD })?.stateHash).toBe(stateBefore)
			expect(gateLinesOf(result.text).filter((line) => /^[✓!✗] test:run\b/.test(line))).toEqual([
				'! test:run 4/4 · commit hook (the tree changed since)',
			])
		})

		it('the same hand-over in a repository with a commit hook → a record; in one without a commit hook → none', async () => {
			const hooked = prepare(printLines(['', '> demo@1.0.0 build', '> tsup']))
			const plain = prepare(undefined)

			const hookedRun = await runFolder({ out: hooked.out })
			const plainRun = await runFolder({ out: plain.out })

			expect(hookedRun.exitCode).toBe(0)
			expect(plainRun.exitCode).toBe(0)
			expect(readRecordFile<GateRecord>({ root: hooked.root, name: HOOK_RECORD })).toMatchObject({
				mode: 'hook',
				steps: [{ name: 'build', status: 'passed' }],
			})
			expect(readRecordFile<GateRecord>({ root: plain.root, name: HOOK_RECORD })).toBeUndefined()
		})

		it('a rehearsal (--keep) → the record in the scratch clone only, none in the repository', async () => {
			const { root, out } = prepare(printLines(PASSING_HOOK_LINES))
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')

			const result = await runFolder({ out, argv: ['--rehearse', '--keep'], scratchRoot })

			const [clone] = readdirSync(scratchRoot).map((name) =>
				join(scratchRoot, name, basename(root)),
			)
			expect(result.exitCode).toBe(0)
			expect(readRecordFile<GateRecord>({ root: clone, name: HOOK_RECORD })).toMatchObject({
				mode: 'hook',
				head: headOf(clone),
			})
			expect(readRecordFile<GateRecord>({ root, name: HOOK_RECORD })).toBeUndefined()
		})
	},
)
