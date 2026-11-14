import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { createScratchRepository, writeFiles } from '../../test/scratch-repository.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding } from '../lib/rules/check-code-rules.types.ts'

const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')
const FILE_COUNT = 50
const FINDINGS_PER_FILE = 52
const MINIMUM_BYTES = 512 * 1024
const GATE_VARIABLE_PREFIX = 'DIALECTE_GATE_'

/** A module of function-as-const findings, one per line. */
function brokenModuleOf(fileIndex: number): string {
	return (
		Array.from(
			{ length: FINDINGS_PER_FILE },
			(_, index) => `export const read${fileIndex}x${index} = () => ${index}`,
		).join('\n') + '\n'
	)
}

/** The process's environment without any gate variable: the run is no scoped step. */
function plainEnvironment(): NodeJS.ProcessEnv {
	return Object.fromEntries(
		Object.entries(process.env).filter(([name]) => !name.startsWith(GATE_VARIABLE_PREFIX)),
	)
}

/** The cli as a process, its output consumed as it comes; the child is killed if it is still alive at the end. */
async function runCli(params: {
	cwd: string
	argv: string[]
}): Promise<{ status: number | null; stdout: string }> {
	const child = spawn(process.execPath, [CLI_SOURCE, ...params.argv], {
		cwd: params.cwd,
		env: plainEnvironment(),
		stdio: ['ignore', 'pipe', 'ignore'],
	})
	try {
		const chunks: Buffer[] = []
		child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
		const status = await new Promise<number | null>((resolvePromise, rejectPromise) => {
			child.once('error', rejectPromise)
			child.once('close', resolvePromise)
		})
		return { status, stdout: Buffer.concat(chunks).toString('utf8') }
	} finally {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
	}
}

describe('dialecte rules: an output through a pipe', { timeout: CLI_SURFACE_CASE_TIMEOUT }, () => {
	it('more than 512 KiB of --json → the reader gets it whole: it parses and holds every finding', async () => {
		const root = createScratchRepository()
		writeFiles({
			root,
			files: Object.fromEntries(
				Array.from({ length: FILE_COUNT }, (_, index) => [
					`src/lib/file-${index}.ts`,
					brokenModuleOf(index),
				]),
			),
		})

		const { status, stdout } = await runCli({ cwd: root, argv: ['rules', '--json'] })

		expect({
			status,
			longEnough: Buffer.byteLength(stdout) >= MINIMUM_BYTES,
			findings: parsedFindingsOf(stdout),
		}).toEqual({ status: 1, longEnough: true, findings: FILE_COUNT * FINDINGS_PER_FILE })
	})
})

/** How many findings the text holds as JSON; -1 when it is not JSON. */
function parsedFindingsOf(text: string): number {
	try {
		return (JSON.parse(text) as { findings: RuleFinding[] }).findings.length
	} catch {
		return -1
	}
}
