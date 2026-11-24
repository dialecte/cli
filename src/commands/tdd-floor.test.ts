/** `dialecte tdd`, spawned: a cli older than the version the package asks for runs no subcommand (FIX-loud-refusals D4). */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
	ABOVE_VERSION,
	CLI_SOURCE,
	REFUSAL_WORD,
} from '../../test/cli-floor-workspace.constants.ts'
import {
	createPackageRepository,
	isolateState,
	jsonOrUndefined,
	manifestPinning,
} from '../../test/cli-floor-workspace.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { TDD_LEDGER_FILE } from '../lib/tdd/tdd.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** `dialecte tdd <args>` from `cwd`: its exit and its two streams. */
function runTddCli(params: { cwd: string; args: string[] }): {
	status: number | null
	stdout: string
	stderr: string
} {
	const run = spawnSync(process.execPath, [CLI_SOURCE, 'tdd', ...params.args], {
		cwd: params.cwd,
		encoding: 'utf8',
	})
	return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

describe('tdd: the cli floor', { timeout: CLI_SURFACE_CASE_TIMEOUT }, () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	it('tdd red under a pin above -> refused on stderr naming tdd, exit 2, stdout empty', () => {
		isolateState()
		const root = createPackageRepository({
			manifest: manifestPinning({ spec: `^${ABOVE_VERSION}` }),
		})

		const run = runTddCli({ cwd: root, args: ['red'] })

		expect({
			status: run.status,
			stdout: run.stdout,
			first: run.stderr.split('\n')[0],
			refused: run.stderr.includes(REFUSAL_WORD),
			ledger: existsSync(join(root, '.git', TDD_LEDGER_FILE)),
		}).toEqual({
			status: 2,
			stdout: '',
			first: expect.stringMatching(/^tdd: this cli is /),
			refused: true,
			ledger: false,
		})
	})

	it('tdd red --json under a pin above -> { error, next: null } on stderr, stdout empty', () => {
		isolateState()
		const root = createPackageRepository({
			manifest: manifestPinning({ spec: `^${ABOVE_VERSION}` }),
		})

		const run = runTddCli({ cwd: root, args: ['red', '--json'] })

		expect({ status: run.status, stdout: run.stdout, json: jsonOrUndefined(run.stderr) }).toEqual({
			status: 2,
			stdout: '',
			json: { error: expect.stringContaining(REFUSAL_WORD), next: null },
		})
	})
})
