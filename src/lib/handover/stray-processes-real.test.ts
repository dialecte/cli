/**
 * `strayProcesses` on the real system: an idle process left running in a scratch repository (detached, re-parented
 * to pid 1) is listed left behind with its pid, the running test's own process tree never is. Every process a case
 * starts is killed by the case's `afterEach`, whether the case passed or not.
 */
import { mkdirSync, realpathSync } from 'node:fs'
import { basename, join } from 'node:path'

import { NON_ASCII_WORD } from '../../../test/rule-gaps-processes.constants.ts'
import {
	startLeftBehind,
	startOwnChild,
	stopProcess,
	stopStarted,
	stubSearchPathWith,
} from '../../../test/rule-gaps-processes.ts'
import {
	createScratchRepository,
	git,
	initializeRepository,
	isolateGitConfig,
	temporaryFolder,
} from '../../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { EDITOR_CONFIG_KEY } from '../editor/editor.constants.ts'
import { readProcessRows, strayProcesses } from './stray-processes.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StrayProcesses } from './stray-processes.types.ts'

afterEach(async function stopTheProcessesStarted() {
	vi.unstubAllEnvs()
	await stopStarted()
})

/** A scratch repository, git reading a config of the test's own. */
function scratchWorktree(): string {
	isolateGitConfig()
	return createScratchRepository()
}

/** The pids of every process listed, left behind or a tool, and why the list is not known. */
function everyListed(outcome: StrayProcesses): { listed: number[]; unknown: string | undefined } {
	return {
		listed: [...outcome.leftBehind, ...outcome.tools].map((entry) => entry.pid),
		unknown: outcome.unknown,
	}
}

describe('strayProcesses: the real system', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('P1 a detached idle process re-parented to pid 1 working in the worktree → listed left behind with its pid and the real path of the folder, no tool, the list known', async () => {
		const root = scratchWorktree()
		const pid = await startLeftBehind({ cwd: root })

		expect(strayProcesses({ worktree: root, root })).toEqual({
			leftBehind: [{ pid, command: expect.any(String), folder: realpathSync(root) }],
			tools: [],
		})
	})

	it('P1 the process killed → none listed', async () => {
		const root = scratchWorktree()
		const pid = await startLeftBehind({ cwd: root })
		await stopProcess(pid)

		expect(strayProcesses({ worktree: root, root })).toEqual({ leftBehind: [], tools: [] })
	})

	it('P2 a direct child of the running test working in the worktree → never listed (the cli own tree), and the test process itself neither', async () => {
		const root = scratchWorktree()
		startOwnChild({ cwd: root })

		expect(everyListed(strayProcesses({ worktree: root, root }))).toEqual({
			listed: [],
			unknown: undefined,
		})
	})

	it('P2 a left-behind process beside a direct child of the test → only the left-behind one is listed, not the test own pid', async () => {
		const root = scratchWorktree()
		startOwnChild({ cwd: root })
		const pid = await startLeftBehind({ cwd: root })

		expect(strayProcesses({ worktree: root, root }).leftBehind.map((entry) => entry.pid)).toEqual([
			pid,
		])
	})

	it('P6 a sibling folder beside the worktree whose name starts with it, holding an idle process → not listed for the worktree', async () => {
		isolateGitConfig()
		const base = temporaryFolder('dialecte-siblings-')
		const root = initializeRepository({ root: join(base, '0016-cli') })
		const sibling = join(base, '0016-cli-x')
		mkdirSync(sibling)
		const pid = await startLeftBehind({ cwd: sibling })

		expect({
			worktree: strayProcesses({ worktree: root, root }),
			sibling: strayProcesses({ worktree: sibling, root }).leftBehind.map((entry) => entry.pid),
		}).toEqual({ worktree: { leftBehind: [], tools: [] }, sibling: [pid] })
	})

	it('P11 a search path holding git and lsof but no ps, a process working there → nothing listed, unknown says why', async () => {
		const root = scratchWorktree()
		await startLeftBehind({ cwd: root })
		stubSearchPathWith({ keep: ['lsof'] })

		expect(strayProcesses({ worktree: root, root })).toEqual({
			leftBehind: [],
			tools: [],
			unknown: expect.stringMatching(/.+/),
		})
	})

	it('R3-2 an idle node whose command line ends in a word holding non-ASCII characters → its row is read whole: the executable is node and the command line ends in that word', async () => {
		const root = scratchWorktree()
		const pid = await startLeftBehind({ cwd: root, argv0: 'node', lastWord: NON_ASCII_WORD })

		const rows = readProcessRows()
		const found = Array.isArray(rows) ? rows.find((candidate) => candidate.pid === pid) : undefined

		expect({
			read: Array.isArray(rows),
			command: basename(found?.command ?? ''),
			args: found?.args.endsWith(NON_ASCII_WORD),
		}).toEqual({ read: true, command: basename(process.execPath), args: true })
	})

	it('R3-2 the same process working in the worktree → listed left behind with its whole command line, ending in the non-ASCII word', async () => {
		const root = scratchWorktree()
		const pid = await startLeftBehind({ cwd: root, argv0: 'node', lastWord: NON_ASCII_WORD })

		expect(
			strayProcesses({ worktree: root, root }).leftBehind.map((entry) => ({
				pid: entry.pid,
				endsInWord: entry.command.endsWith(NON_ASCII_WORD),
			})),
		).toEqual([{ pid, endsInWord: true }])
	})

	it('P4 dialecte.editor set to the running node and a flag → the idle node process is a tool, not left behind', async () => {
		const root = scratchWorktree()
		git({ root, args: ['config', EDITOR_CONFIG_KEY, `${process.execPath} --wait`] })
		const pid = await startLeftBehind({ cwd: root })

		expect(strayProcesses({ worktree: root, root })).toEqual({
			leftBehind: [],
			tools: [{ pid, command: expect.any(String), folder: realpathSync(root) }],
		})
	})
})
