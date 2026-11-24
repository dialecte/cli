/**
 * Where a `lot`, `inbox` and `handover run` result goes (FIX-loud-refusals D2, D3): an answer's non-zero exit stays on
 * standard output, every refusal goes to standard error, and a `handover run` that stops ends with one verdict line
 * read from the hand-over's state. The spawned rows prove the commands print through the one writer.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'

import { damagedLotIn } from '../../test/damaged-lot-workspace.ts'
import { createFakeClock } from '../../test/fake-clock.ts'
import {
	FORECAST_NOW,
	LOCK_A,
	LOCK_B,
	SHARED_LINE2_A,
	SHARED_LINE2_MAIN,
} from '../../test/forecast-workspace.constants.ts'
import {
	commitOnMain,
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../test/forecast-workspace.ts'
import { STORE_FIRST_NAME, STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	failHookAfterFirstCommit,
	markAbandoned,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import { createStartWorkspace } from '../../test/lot-start-workspace.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { HANDOVER_FILES, HANDOVER_RUN_TEXTS } from '../lib/handover/handover.constants.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { streamOfResult } from '../lib/print/command-output.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runHandoverRun } from './handover.ts'
import { runInbox } from './inbox.ts'
import { lotForecast } from './lot-forecast.ts'
import { waitLot } from './lot-wait.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'

// the forecast and brief workspaces point XDG_STATE_HOME and git's config into the case's own folder
afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

/** `dialecte <argv>` spawned from `cwd`: its exit and its two streams. */
function spawnCli(params: { cwd: string; argv: string[] }): {
	status: number | null
	stdout: string
	stderr: string
} {
	const run = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		cwd: params.cwd,
		encoding: 'utf8',
		env: childEnvironment(),
	})
	return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

/** The environment of a spawned cli: its temporary files in a folder of the case's own, removed when the case ends. */
function childEnvironment(): NodeJS.ProcessEnv {
	return { ...process.env, TMPDIR: temporaryFolder('dialecte-spawned-tmp-') }
}

/** A forecast lot whose record cannot be written: a folder stands where the record file goes. */
function lotWithUnwritableForecast(): { worktree: string } {
	const workspace = createForecastWorkspace()
	const lot = startForecastLot({ workspace, feature: 'lot-a' })
	const record = join(lot.lotFolder, STORE_FILES.forecast)
	rmSync(record, { force: true })
	mkdirSync(record)
	return { worktree: lot.worktree }
}

describe('answers keep standard output', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot status, lot result and lot wait --json on a damaged lot -> exit 6 on stdout: a state, not a refusal', async () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing' })
		const status = runLot({ cwd: start.repository, argv: ['status', lot.name] })
		const result = runLot({ cwd: start.repository, argv: ['result', lot.name] })
		const wait = await waitLot({ cwd: start.repository, argv: [lot.name, '--json'] })

		expect([
			{ exitCode: status.exitCode, stream: streamOfResult({ result: status }) },
			{ exitCode: result.exitCode, stream: streamOfResult({ result }) },
			{ exitCode: wait.exitCode, stream: streamOfResult({ result: wait }) },
		]).toEqual([
			{ exitCode: 6, stream: 'stdout' },
			{ exitCode: 6, stream: 'stdout' },
			{ exitCode: 6, stream: 'stdout' },
		])
	})

	it('inbox with nothing waiting -> exit 1 on stdout', () => {
		const start = createStartWorkspace()
		const result = runInbox({
			cwd: start.repository,
			argv: [],
			tmp: temporaryFolder('dialecte-inbox-tmp-'),
			isAlive: function noneAlive() {
				return false
			},
		})

		expect({ exitCode: result.exitCode, stream: streamOfResult({ result }) }).toEqual({
			exitCode: 1,
			stream: 'stdout',
		})
	})

	it('lot forecast with a conflict -> exit 1 on stdout: a verdict, not a failure', () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'lot-a' })
		workInLot({ lot, files: { 'src/shared.ts': SHARED_LINE2_A } })
		commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE2_MAIN } })
		const result = lotForecast({ cwd: lot.worktree, argv: [], now: FORECAST_NOW })

		expect({ exitCode: result.exitCode, stream: streamOfResult({ result }) }).toEqual({
			exitCode: 1,
			stream: 'stdout',
		})
	})

	it('lot forecast where every conflict is a lock file (exclusive) -> exit 1 on stdout', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({ lot: first, files: { 'package-lock.json': LOCK_A } })
		workInLot({ lot: second, files: { 'package-lock.json': LOCK_B } })
		const result = lotForecast({ cwd: first.worktree, argv: [], now: FORECAST_NOW })

		expect({ exitCode: result.exitCode, stream: streamOfResult({ result }) }).toEqual({
			exitCode: 1,
			stream: 'stdout',
		})
	})
})

describe('refusals go to standard error', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot forecast whose record cannot be written -> exit 1 on stderr, never read as a conflict', () => {
		const lot = lotWithUnwritableForecast()
		const result = lotForecast({ cwd: lot.worktree, argv: [], now: FORECAST_NOW })

		expect({ exitCode: result.exitCode, stream: streamOfResult({ result }) }).toEqual({
			exitCode: 1,
			stream: 'stderr',
		})
	})

	it('lot forecast whose record cannot be written, spawned -> the failure on stderr, stdout empty, exit 1', () => {
		const lot = lotWithUnwritableForecast()
		const run = spawnCli({ cwd: lot.worktree, argv: ['lot', 'forecast'] })

		expect({
			status: run.status,
			stdout: run.stdout,
			failed: run.stderr.startsWith('lot forecast: '),
		}).toEqual({
			status: 1,
			stdout: '',
			failed: true,
		})
	})
})

/** A `handover run` from `cwd`: its result and the lines it streamed while running. */
async function handoverRunIn(params: {
	cwd: string
	argv: string[]
	afterCheck?: () => void
}): Promise<{ result: CommandResult; streamed: string[] }> {
	const streamed: string[] = []
	removeHookLogs({ lines: streamed })
	const result = await runHandoverRun({
		argv: params.argv,
		write: function record(line) {
			streamed.push(line)
		},
		clock: createFakeClock(),
		colour: false,
		probe: noRepositoryCli,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		cliPath: STORE_WRITER_CLI,
		cwd: params.cwd,
		spawner: createRecordingSpawner().spawner,
		afterCheck: params.afterCheck,
	})
	return { result, streamed }
}

/** A hand-over of two lots in a fresh repository whose hook fails once the first lot is committed. */
function handoverStoppingAfterFirstLot(): { root: string; folder: string } {
	const root = createBranchRepository()
	const { folder } = writeStoreHandover({
		root,
		name: STORE_FIRST_NAME,
		changes: { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b = 1\n' },
		lots: [
			{ paths: ['src/a.ts'], message: 'feat(a): add a' },
			{ paths: ['src/b.ts'], message: 'feat(b): add b' },
		],
	})
	failHookAfterFirstCommit(root)
	return { root, folder }
}

describe(
	'handover run: refusals on stderr, nothing streamed',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('nothing to run -> its line on stderr, exit 1', async () => {
			const root = createBranchRepository()
			const run = await handoverRunIn({ cwd: root, argv: [] })

			expect({
				exitCode: run.result.exitCode,
				stream: streamOfResult({ result: run.result }),
				output: run.result.output,
				streamed: run.streamed,
			}).toEqual({
				exitCode: 1,
				stream: 'stderr',
				output: expect.stringContaining('handover run: no hand-over to run in '),
				streamed: [],
			})
		})

		it('several to run -> its line and each candidate on stderr, exit 2', async () => {
			const root = createBranchRepository()
			const second = `${STORE_FIRST_NAME}-2`
			writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
			writeStoreHandover({
				root,
				name: second,
				changes: { 'src/write.ts': 'export function write() {}\n' },
			})
			const run = await handoverRunIn({ cwd: root, argv: [] })

			expect({
				exitCode: run.result.exitCode,
				stream: streamOfResult({ result: run.result }),
				names: [STORE_FIRST_NAME, second].every(function named(name) {
					return run.result.output.includes(name)
				}),
				several: run.result.output.includes('hand-overs to run in'),
				streamed: run.streamed,
			}).toEqual({ exitCode: 2, stream: 'stderr', names: true, several: true, streamed: [] })
		})

		it('a folder that is no hand-over -> its refusal on stderr, exit 2', async () => {
			const root = createBranchRepository()
			const run = await handoverRunIn({ cwd: root, argv: [temporaryFolder('not-a-handover-')] })

			expect({
				exitCode: run.result.exitCode,
				stream: streamOfResult({ result: run.result }),
				output: run.result.output,
				streamed: run.streamed,
			}).toEqual({
				exitCode: 2,
				stream: 'stderr',
				output: expect.stringMatching(/^handover run: /),
				streamed: [],
			})
		})

		it('an abandoned hand-over -> its refusal on stderr, exit 2', async () => {
			const root = createBranchRepository()
			const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
			markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
			const run = await handoverRunIn({ cwd: root, argv: [STORE_FIRST_NAME] })

			expect({
				exitCode: run.result.exitCode,
				stream: streamOfResult({ result: run.result }),
				// an abandoned store lot reads as canceled before its marker is read: refused either way
				refused: run.result.output.startsWith('handover run: '),
				streamed: run.streamed,
			}).toEqual({ exitCode: 2, stream: 'stderr', refused: true, streamed: [] })
		})

		it('abandoned between the checks and the run (interleaving) -> its refusal on stderr, no header streamed, exit 2', async () => {
			const root = createBranchRepository()
			const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
			const run = await handoverRunIn({
				cwd: root,
				argv: [STORE_FIRST_NAME],
				afterCheck: function abandonNow() {
					markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
				},
			})

			expect({
				exitCode: run.result.exitCode,
				stream: streamOfResult({ result: run.result }),
				refused: run.result.output.includes('was abandoned while this run started'),
				streamed: run.streamed,
			}).toEqual({ exitCode: 2, stream: 'stderr', refused: true, streamed: [] })
		})

		it('no store (a folder outside every repository) -> its refusal on stderr, exit 2', async () => {
			const run = await handoverRunIn({ cwd: temporaryFolder('dialecte-no-store-'), argv: [] })

			expect({
				exitCode: run.result.exitCode,
				stream: streamOfResult({ result: run.result }),
				refused: run.result.output.includes('is in no git repository'),
				streamed: run.streamed,
			}).toEqual({ exitCode: 2, stream: 'stderr', refused: true, streamed: [] })
		})

		it('nothing to run, spawned -> stdout empty, its line on stderr, exit 1', () => {
			const root = createBranchRepository()
			const run = spawnCli({ cwd: root, argv: ['handover', 'run'] })

			expect({
				status: run.status,
				stdout: run.stdout,
				line: run.stderr.includes('handover run: no hand-over to run in '),
			}).toEqual({ status: 1, stdout: '', line: true })
		})
	},
)

describe('handover run: its verdict', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a run stopped after its first lot -> the lines on stdout, one verdict line naming the state on stderr', async () => {
		const { root, folder } = handoverStoppingAfterFirstLot()
		const run = await handoverRunIn({ cwd: root, argv: [folder] })

		expect({
			stream: streamOfResult({ result: run.result }),
			verdict: run.result.output,
			streamedSomething: run.streamed.length > 0,
		}).toEqual({
			stream: 'stderr',
			verdict: fillMessage({
				template: HANDOVER_RUN_TEXTS.stopped,
				values: {
					name: basename(folder),
					code: String(run.result.exitCode),
					state: 'partly committed',
				},
			}),
			streamedSomething: true,
		})
	})

	it('a failing rehearsal -> its own verdict line on stderr, nothing committed', async () => {
		const { root, folder } = handoverStoppingAfterFirstLot()
		const run = await handoverRunIn({ cwd: root, argv: [folder, '--rehearse'] })

		expect({
			stream: streamOfResult({ result: run.result }),
			verdict: run.result.output,
		}).toEqual({
			stream: 'stderr',
			verdict: fillMessage({
				template: HANDOVER_RUN_TEXTS.rehearsalFailed,
				values: { name: basename(folder), code: String(run.result.exitCode) },
			}),
		})
	})

	it('a run stopped, spawned with stderr merged into stdout -> the verdict is the last line, after the card', () => {
		const { root, folder } = handoverStoppingAfterFirstLot()
		const run = spawnSync(
			'sh',
			['-c', `"${process.execPath}" "${CLI_SOURCE}" handover run "${folder}" 2>&1`],
			{ cwd: root, encoding: 'utf8', env: childEnvironment() },
		)
		const lines = run.stdout.trimEnd().split('\n')
		// the hook log folders its lines name go when the case ends
		removeHookLogs({ lines })

		expect({ failed: run.status !== 0, last: lines.at(-1), before: lines.length > 1 }).toEqual({
			failed: true,
			last: expect.stringMatching(
				new RegExp(`^handover run: ${basename(folder)} stopped \\(exit `),
			),
			before: true,
		})
	})

	it('a committed run -> exit 0, no output', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const run = await handoverRunIn({ cwd: root, argv: [folder] })

		expect({ exitCode: run.result.exitCode, output: run.result.output }).toEqual({
			exitCode: 0,
			output: '',
		})
	})
})
