import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RUN_FIXTURES, TEST_DIALECTE_PACKAGE } from '../../test/run/run-environment.constants.ts'
import { loadTestEnvironment, testProjectDirectory } from '../../test/run/run-environment.ts'
import { runCommand } from './run.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let scratch: string

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'dialecte-cli-run-'))
})

afterEach(() => {
	rmSync(scratch, { recursive: true, force: true })
})

async function invoke(
	argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const stdout: string[] = []
	const stderr: string[] = []
	const exitCode = await runCommand({
		argv,
		cwd: testProjectDirectory(),
		output: {
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		},
	})
	return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
}

const SCRIPT = join(RUN_FIXTURES, 'add-aa2.ts')
const INPUT = join(RUN_FIXTURES, 'input.xml')
const EXPECT = join(RUN_FIXTURES, 'two-aa2.expect.json')

describe('dialecte run', () => {
	type TestCase = {
		argv: () => string[]
		expected: (result: { exitCode: number; stdout: string; stderr: string }) => void | Promise<void>
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'--expect not met → exit 1, the failed expectation named': {
			argv: () => [SCRIPT, '--package', TEST_DIALECTE_PACKAGE, '--in', INPUT, '--expect', EXPECT],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(1)
				expect(stdout).toContain('expectations: 1 passed, 1 failed')
				expect(stdout).toContain('  ✗ expected 2 AA_2[aAA_2="7"], found 1')
			},
		},
		'--json → the outcome as JSON, the script result included': {
			argv: () => [
				SCRIPT,
				'--package',
				TEST_DIALECTE_PACKAGE,
				'--in',
				INPUT,
				'--json',
				'--seed',
				'5',
			],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				const outcome = JSON.parse(stdout)
				expect(outcome.ok).toBe(true)
				expect(outcome.operations.AA_2).toEqual({ created: 1, updated: 0, deleted: 0 })
				expect(outcome.result).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
				)
			},
		},
		'--prepare → the staged transaction named, nothing committed': {
			argv: () => [SCRIPT, '--package', TEST_DIALECTE_PACKAGE, '--in', INPUT, '--prepare'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(stdout).toContain('prepared: add AA_2 - staged, nothing committed')
				expect(stdout).toContain('operations: A +0 ~1 -0, AA_2 +1 ~0 -0')
			},
		},
		'--out → the document written as XML': {
			argv: () => [
				SCRIPT,
				'--package',
				TEST_DIALECTE_PACKAGE,
				'--in',
				INPUT,
				'--out',
				join(scratch, 'out.xml'),
			],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				const written = readFileSync(join(scratch, 'out.xml'), 'utf8')
				expect(written).toContain('<AA_2 aAA_2="7"/>')
				expect(stdout).toContain(`export: ${Buffer.byteLength(written)} bytes`)
			},
		},
		'no script → exit 2 with the usage': {
			argv: () => ['--package', TEST_DIALECTE_PACKAGE],
			expected({ exitCode, stderr }) {
				expect(exitCode).toBe(2)
				expect(stderr).toContain('run: name one script')
				expect(stderr).toContain('usage: dialecte run <script.ts>')
			},
		},
		'--prepare with --out → exit 2': {
			argv: () => [SCRIPT, '--prepare', '--out', join(scratch, 'out.xml')],
			expected({ exitCode, stderr }) {
				expect(exitCode).toBe(2)
				expect(stderr).toContain('--out with --prepare')
			},
		},
		'a script without a default export → exit 2, the expected shape named': {
			argv: () => [EXPECT, '--package', TEST_DIALECTE_PACKAGE],
			expected({ exitCode, stderr }) {
				expect(exitCode).toBe(2)
				expect(stderr).toContain('has no default export function')
			},
		},
		'an id minted at the module top level → seeded too': {
			argv: () => [
				join(RUN_FIXTURES, 'top-level-id.ts'),
				'--package',
				TEST_DIALECTE_PACKAGE,
				'--seed',
				'9',
				'--json',
			],
			async expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				const { core } = await loadTestEnvironment()
				expect(JSON.parse(stdout).result).toBe(core.createSeededRandomUuid({ seed: 9 })())
			},
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		const declare = testCase.only ? it.only : it
		declare(description, async () => {
			const result = await invoke(testCase.argv())
			await testCase.expected(result)
		})
	}
})
