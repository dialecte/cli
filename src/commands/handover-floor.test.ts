/**
 * `dialecte handover`, spawned: a cli older than the version the package, or the hand-over's repository, asks for runs
 * no verb (FIX-loud-refusals D4); the refusal goes to standard error.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import {
	ABOVE_VERSION,
	CLI_SOURCE,
	REFUSAL_WORD,
} from '../../test/cli-floor-workspace.constants.ts'
import {
	bareFolder,
	createPackageRepository,
	isolateState,
	manifestPinning,
} from '../../test/cli-floor-workspace.ts'
import { STORE_FIRST_NAME } from '../../test/handover-store-scenario.constants.ts'
import { createBranchRepository, writeStoreHandover } from '../../test/handover-store-scenario.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** `dialecte handover <args>` from `cwd`: its exit and its two streams. */
function runHandoverCli(params: { cwd: string; args: string[] }): {
	status: number | null
	stdout: string
	stderr: string
} {
	const run = spawnSync(process.execPath, [CLI_SOURCE, 'handover', ...params.args], {
		cwd: params.cwd,
		encoding: 'utf8',
	})
	return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

/** The run judged: its exit, standard output, and whether standard error holds the floor's refusal naming handover. */
function verdictOf(run: { status: number | null; stdout: string; stderr: string }): {
	status: number | null
	stdout: string
	refused: boolean
} {
	return {
		status: run.status,
		stdout: run.stdout,
		refused: run.stderr.startsWith('handover: this cli is ') && run.stderr.includes(REFUSAL_WORD),
	}
}

/** A repository on a branch whose package.json pins the cli above the running one, holding one hand-over. */
function pinnedHandover(): { root: string; folder: string } {
	const root = createBranchRepository()
	writeFiles({ root, files: { 'package.json': manifestPinning({ spec: `^${ABOVE_VERSION}` }) } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'chore: pin the cli'] })
	const { folder } = writeStoreHandover({
		root,
		name: STORE_FIRST_NAME,
		changes: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' },
	})
	return { root, folder }
}

describe('handover: the cli floor', { timeout: CLI_SURFACE_CASE_TIMEOUT }, () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	it('handover list under a pin above -> refused on stderr, exit 2, stdout empty', () => {
		isolateState()
		const root = createPackageRepository({
			manifest: manifestPinning({ spec: `^${ABOVE_VERSION}` }),
		})

		expect(verdictOf(runHandoverCli({ cwd: root, args: ['list'] }))).toEqual({
			status: 2,
			stdout: '',
			refused: true,
		})
	})

	it("handover run <folder> from a folder with no package.json, the hand-over's repository pinning above -> refused", () => {
		isolateState()
		const { folder } = pinnedHandover()

		expect(verdictOf(runHandoverCli({ cwd: bareFolder(), args: ['run', folder] }))).toEqual({
			status: 2,
			stdout: '',
			refused: true,
		})
	})

	it("handover <lots.json> from a folder with no package.json, the lots file's repository pinning above -> refused", () => {
		isolateState()
		const { folder } = pinnedHandover()

		expect(
			verdictOf(runHandoverCli({ cwd: bareFolder(), args: [join(folder, 'lots.json')] })),
		).toEqual({ status: 2, stdout: '', refused: true })
	})

	it('handover run --probe under a pin above -> refused: the probe is guarded too', () => {
		isolateState()
		const root = createPackageRepository({
			manifest: manifestPinning({ spec: `^${ABOVE_VERSION}` }),
		})

		expect(verdictOf(runHandoverCli({ cwd: root, args: ['run', '--probe'] }))).toEqual({
			status: 2,
			stdout: '',
			refused: true,
		})
	})
})
