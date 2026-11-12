/** `handover write --target <branch>`: the branch the lots land on, recorded in the lots file; the resolved base branch without it. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_NOW, STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	entryNamesOf,
	runIn,
	writeLotsFile,
} from '../../test/handover-store-scenario.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { addOriginBranch } from '../../test/rule-gaps-base-branch.ts'
import { moveBranchTip } from '../../test/rule-gaps-target-moved.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import { HANDOVER_FILES } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

/** A hand-over of the one changed file written into a new folder with `extra` arguments; the result and the folder. */
function writeWith(params: { root: string; extra: string[] }): {
	result: CommandResult
	folder: string
} {
	const { root } = params
	writeFiles({ root, files: CHANGES })
	const lotsPath = writeLotsFile({ root, name: 'target' })
	const folder = join(temporaryFolder('dialecte-target-out-'), 'handover')
	const result = runHandover({
		argv: [lotsPath, '--out', folder, ...params.extra],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: STORE_NOW,
	})
	return { result, folder }
}

/** The `target` the folder's lots file holds; undefined when it holds none. */
function targetOf(folder: string): unknown {
	return (
		JSON.parse(readFileSync(join(folder, HANDOVER_FILES.lots), 'utf8')) as { target?: unknown }
	).target
}

describe('handover write --target', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('--target naming a branch that exists nowhere → exit 2 naming it, no folder, no entry, no lock', () => {
		const root = createBranchRepository()

		const { result, folder } = writeWith({ root, extra: ['--target', 'nope'] })

		expect({
			exitCode: result.exitCode,
			output: result.output,
			folderWritten: existsSync(folder),
			entries: entryNamesOf(root),
			lockHeld: existsSync(handoverLockPath(root)),
		}).toEqual({
			exitCode: 2,
			output: expect.stringContaining('nope'),
			folderWritten: false,
			entries: [],
			lockHeld: false,
		})
	})

	it('--target release/1.x, a local branch → exit 0, the written lots.json holds target release/1.x', () => {
		const root = createBranchRepository()
		git({ root, args: ['branch', 'release/1.x'] })

		const { result, folder } = writeWith({ root, extra: ['--target', 'release/1.x'] })

		expect({ exitCode: result.exitCode, target: targetOf(folder) }).toEqual({
			exitCode: 0,
			target: 'release/1.x',
		})
	})

	it('without --target, main resolved as the base branch → the written lots.json holds target main', () => {
		const root = createBranchRepository()

		const { result, folder } = writeWith({ root, extra: [] })

		expect({ exitCode: result.exitCode, target: targetOf(folder) }).toEqual({
			exitCode: 0,
			target: 'main',
		})
	})

	it('without --target and no base branch found (main renamed away) → exit 2 naming dialecte.baseBranch, nothing written', () => {
		const root = createBranchRepository()
		git({ root, args: ['branch', '-m', 'main', 'work'] })

		const { result, folder } = writeWith({ root, extra: [] })

		expect({
			exitCode: result.exitCode,
			output: result.output,
			folderWritten: existsSync(folder),
			entries: entryNamesOf(root),
			lockHeld: existsSync(handoverLockPath(root)),
		}).toEqual({
			exitCode: 2,
			output: expect.stringContaining('dialecte.baseBranch'),
			folderWritten: false,
			entries: [],
			lockHeld: false,
		})
	})

	it('--target naming a branch that only origin has → exit 0, the written lots.json holds that target', () => {
		const root = createBranchRepository()
		addOriginBranch({ root, branch: 'release/1.x' })

		const { result, folder } = writeWith({ root, extra: ['--target', 'release/1.x'] })

		expect({ exitCode: result.exitCode, target: targetOf(folder) }).toEqual({
			exitCode: 0,
			target: 'release/1.x',
		})
	})

	it('R3-9 --target naming a branch that exists nowhere → the refusal says no such branch, local or on origin, and no longer tells to write the hand-over again', () => {
		const root = createBranchRepository()

		const { result } = writeWith({ root, extra: ['--target', 'nope'] })

		expect({
			exitCode: result.exitCode,
			namesTheMissingBranch: result.output.includes(
				'--target nope: no such branch, local or on origin',
			),
			writeAgain: result.output.includes('write the hand-over again'),
		}).toEqual({ exitCode: 2, namesTheMissingBranch: true, writeAgain: false })
	})

	it('R3-7 --target as the last argument with no value → exit 2, nothing written: no folder, no entry, no lock', () => {
		const root = createBranchRepository()

		const { result, folder } = writeWith({ root, extra: ['--target'] })

		expect({
			exitCode: result.exitCode,
			output: result.output,
			folderWritten: existsSync(folder),
			entries: entryNamesOf(root),
			lockHeld: existsSync(handoverLockPath(root)),
		}).toEqual({
			exitCode: 2,
			output: expect.stringContaining('--target'),
			folderWritten: false,
			entries: [],
			lockHeld: false,
		})
	})

	it('R3-8 a --target branch named a$&b, then moved → the run guard line holds the name verbatim, never a replacement pattern read', async () => {
		const root = createBranchRepository()
		git({ root, args: ['branch', 'a$&b'] })
		const { folder } = writeWith({ root, extra: ['--target', 'a$&b'] })
		moveBranchTip({ root, branch: 'a$&b' })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			holdsTheName: run.text.includes('a$&b moved: merge a$&b first (1 commit(s) on a$&b, now '),
		}).toEqual({ exitCode: 2, holdsTheName: true })
	})

	it('a valid --target while the base branch resolver refuses (main renamed away) → exit 0, the target is recorded', () => {
		const root = createBranchRepository()
		git({ root, args: ['branch', 'release/1.x'] })
		git({ root, args: ['branch', '-m', 'main', 'work'] })

		const { result, folder } = writeWith({ root, extra: ['--target', 'release/1.x'] })

		expect({ exitCode: result.exitCode, target: targetOf(folder) }).toEqual({
			exitCode: 0,
			target: 'release/1.x',
		})
	})
})
