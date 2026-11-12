/**
 * Processes left running in the lot's worktree, on the hand-over card (a failed `processes` line, a warning for the
 * person's tools or an unknown list, `processes` in the json, nothing on a DONE or ABANDONED card) and in `handover
 * run` (the `processes` guard after `target`: exit 2, nothing committed, a rehearsal goes on). Every process a case
 * starts is killed by its `afterEach`.
 */
import { realpathSync } from 'node:fs'
import { basename } from 'node:path'

import { forgedFaultsOf } from '../../test/forged-text.ts'
import { editAgain } from '../../test/handover-profile.ts'
import { STORE_FIRST_NAME } from '../../test/handover-store-scenario.constants.ts'
import {
	boxLines,
	commitStoreHandover,
	createBranchRepository,
	headOf,
	markAbandoned,
	runIn,
	show,
	statusOf,
	subjectsOf,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import {
	FORGED_ARGV0,
	FORGED_ARGV0_WORD,
	FORGED_LINE_START,
} from '../../test/rule-gaps-processes.constants.ts'
import {
	gatedRepository,
	runCliThroughCat,
	startLeftBehind,
	startOwnChild,
	stopProcess,
	stopStarted,
	stubSearchPathWith,
} from '../../test/rule-gaps-processes.ts'
import { git, isolateGitConfig, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_FILES } from '../lib/handover/handover.constants.ts'
import { PERSON_PROCESSES_KEY } from '../lib/handover/stray-processes.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }
const SECOND_NAME = `${STORE_FIRST_NAME}-2`
const NO_PROCESSES = { leftBehind: [], tools: [] }

afterEach(async function stopTheProcessesStarted() {
	vi.unstubAllEnvs()
	await stopStarted()
})

/** The guard lines `name` as a run printed them (a pass, a warning or a refusal). */
function guardLines(params: { text: string; name: string }): string[] {
	return params.text.split('\n').filter((line) => new RegExp(`^[✓!✗] ${params.name} `).test(line))
}

/**
 * The pattern of the line for one process left behind: its pid and command line, then the way to stop it. A guard
 * line ends with the time the guard took, a card row with the way to stop it.
 */
function leftBehindPattern(params: { mark: string; pid: number; guard?: true }): RegExp {
	const tail = params.guard ? '(?: {2}.+)?' : ''
	return new RegExp(
		`^${params.mark} processes +1 left running in the worktree: ${params.pid} .+ {2}\\(stop them: kill ${params.pid}\\)${tail}$`,
	)
}

/** The rows of the card's box about processes, each as its text without the frame and the padding. */
function processRowsOf(output: string): string[] {
	return boxLines(output)
		.map((line) => line.slice('│ '.length).replace(/ *│$/, '').trim())
		.filter((row) => /^[✓!✗] processes /.test(row))
}

/** The card of the hand-over `name` as `handover show` prints it, its rows about processes, and as `--json`. */
function cardOf(params: { root: string; name: string }): {
	output: string
	rows: string[]
	json: Record<string, unknown>
} {
	const output = show({ cwd: params.root, argv: [params.name] }).output
	return {
		output,
		rows: processRowsOf(output),
		json: JSON.parse(show({ cwd: params.root, argv: [params.name, '--json'] }).output),
	}
}

/** The commands of the processes the card's json lists as left behind. */
function leftBehindCommandsOf(json: Record<string, unknown>): string[] {
	const processes = json.processes as { leftBehind: { command: string }[] } | undefined
	return (processes?.leftBehind ?? []).map((entry) => entry.command)
}

/**
 * Names the basename of the running node as the person's own process, in a list of two separated by a comma and a
 * space (a git config of the repository).
 */
function nameNodeAsPersonProcess(root: string): string {
	const name = basename(process.execPath)
	git({ root, args: ['config', PERSON_PROCESSES_KEY, `other-tool, ${name}`] })
	return name
}

describe('the card: processes working in the worktree', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('P1 READY, an idle process left running in the worktree → BLOCKED with the ✗ processes line and its json, then READY again once it is killed', async () => {
		const root = await gatedRepository()
		writeStoreHandover({ root, name: 'processes' })
		const ready = cardOf({ root, name: STORE_FIRST_NAME })
		const pid = await startLeftBehind({ cwd: root })
		const blocked = cardOf({ root, name: STORE_FIRST_NAME })
		await stopProcess(pid)
		const after = cardOf({ root, name: STORE_FIRST_NAME })

		expect({
			ready: { verdict: ready.json.verdict, processes: ready.json.processes },
			blocked: {
				verdict: blocked.json.verdict,
				rows: blocked.rows,
				processes: blocked.json.processes,
			},
			after: { verdict: after.json.verdict, processes: after.json.processes },
		}).toEqual({
			ready: { verdict: 'READY', processes: NO_PROCESSES },
			blocked: {
				verdict: 'BLOCKED',
				rows: [expect.stringMatching(leftBehindPattern({ mark: '✗', pid }))],
				processes: {
					leftBehind: [{ pid, command: expect.any(String), folder: realpathSync(root) }],
					tools: [],
				},
			},
			after: { verdict: 'READY', processes: NO_PROCESSES },
		})
	})

	it('Q15 BLOCKED for another reason (the tree changed since the green gate), an idle process left running → the ✗ processes line is on the card too, and nothing is listed once it is killed', async () => {
		const root = await gatedRepository()
		writeStoreHandover({ root, name: 'processes' })
		editAgain(root)
		const pid = await startLeftBehind({ cwd: root })
		const blocked = cardOf({ root, name: STORE_FIRST_NAME })
		await stopProcess(pid)
		const after = cardOf({ root, name: STORE_FIRST_NAME })

		expect({
			blocked: { verdict: blocked.json.verdict, rows: blocked.rows },
			after: { verdict: after.json.verdict, rows: after.rows },
		}).toEqual({
			blocked: {
				verdict: 'BLOCKED',
				rows: [expect.stringMatching(leftBehindPattern({ mark: '✗', pid }))],
			},
			after: { verdict: 'BLOCKED', rows: [] },
		})
	})

	it('P3 only a process the person named (git config dialecte.personProcesses) works there → READY with the ! processes line naming it, listed as a tool in the json', async () => {
		const root = await gatedRepository()
		writeStoreHandover({ root, name: 'processes' })
		const name = nameNodeAsPersonProcess(root)
		const pid = await startLeftBehind({ cwd: root })

		const card = cardOf({ root, name: STORE_FIRST_NAME })

		expect({
			verdict: card.json.verdict,
			rows: card.rows,
			processes: card.json.processes,
		}).toEqual({
			verdict: 'READY',
			rows: [expect.stringMatching(new RegExp(`^! processes +open on the worktree: ${name}$`))],
			processes: {
				leftBehind: [],
				tools: [{ pid, command: expect.any(String), folder: realpathSync(root) }],
			},
		})
	})

	it('P11 the process list cannot be read (no lsof, no ps on the search path) → READY with the ! processes not known line, the reason in the json, nothing listed', async () => {
		const root = await gatedRepository()
		writeStoreHandover({ root, name: 'processes' })
		await startLeftBehind({ cwd: root })
		stubSearchPathWith()

		const card = cardOf({ root, name: STORE_FIRST_NAME })

		expect({
			verdict: card.json.verdict,
			rows: card.rows,
			processes: card.json.processes,
		}).toEqual({
			verdict: 'READY',
			rows: [expect.stringMatching(/^! processes +not known \(.+\)$/)],
			processes: { leftBehind: [], tools: [], unknown: expect.any(String) },
		})
	})

	it('P14 a DONE card has no processes line and no processes in the json while a pending hand-over of the branch has both, a process left running', async () => {
		const root = await gatedRepository()
		const { folder } = writeStoreHandover({ root, name: 'first' })
		await commitStoreHandover({ root, folder })
		writeFiles({ root, files: { 'notes.txt': 'notes\n' } })
		writeStoreHandover({ root, name: 'second' })
		const pid = await startLeftBehind({ cwd: root })

		const done = cardOf({ root, name: STORE_FIRST_NAME })
		const pending = cardOf({ root, name: SECOND_NAME })

		expect({
			done: { verdict: done.json.verdict, rows: done.rows, processes: done.json.processes },
			pending: { rows: pending.rows },
		}).toEqual({
			done: { verdict: 'DONE', rows: [], processes: undefined },
			pending: { rows: [expect.stringMatching(leftBehindPattern({ mark: '✗', pid }))] },
		})
	})

	it('P14 an ABANDONED card has no processes line and no processes in the json while a pending hand-over of the branch has both, a process left running', async () => {
		const root = await gatedRepository()
		const { folder } = writeStoreHandover({ root, name: 'first' })
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
		writeStoreHandover({ root, name: 'second' })
		const pid = await startLeftBehind({ cwd: root })

		const abandoned = cardOf({ root, name: STORE_FIRST_NAME })
		const pending = cardOf({ root, name: SECOND_NAME })

		expect({
			abandoned: {
				verdict: abandoned.json.verdict,
				rows: abandoned.rows,
				processes: abandoned.json.processes,
			},
			pending: { rows: pending.rows },
		}).toEqual({
			abandoned: { verdict: 'ABANDONED', rows: [], processes: undefined },
			pending: { rows: [expect.stringMatching(leftBehindPattern({ mark: '✗', pid }))] },
		})
	})

	it('P13 a process whose command line holds a forged line and a terminal escape → the ✗ processes row is one line, nothing forged reaches the card', async () => {
		const root = await gatedRepository()
		writeStoreHandover({ root, name: 'processes' })
		const pid = await startLeftBehind({ cwd: root, argv0: FORGED_ARGV0 })

		const card = cardOf({ root, name: STORE_FIRST_NAME })

		expect({
			// the forged word is inside the cut command line: the text reaches the printer
			commandHoldsForgedWord: leftBehindCommandsOf(card.json).map((command) =>
				command.includes(FORGED_ARGV0_WORD),
			),
			faults: forgedFaultsOf(card.output),
			forgedLines: card.output.split('\n').filter((line) => line.startsWith(FORGED_LINE_START)),
			rows: card.rows,
		}).toEqual({
			commandHoldsForgedWord: [true],
			faults: [],
			forgedLines: [],
			rows: [
				expect.stringMatching(new RegExp(`^✗ processes +1 left running in the worktree: ${pid} `)),
			],
		})
	})
})

describe('handover run: the processes guard', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('P1 an idle process left running in the worktree → ✗ processes after ✓ target, exit 2, nothing committed, HEAD and index unchanged; once it is killed the same run commits with ✓ processes', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'processes', changes: CHANGES })
		const before = { head: headOf(root), subjects: subjectsOf(root), status: statusOf(root) }
		const pid = await startLeftBehind({ cwd: root })

		const refused = await runIn({ cwd: root, argv: [folder] })
		const afterRefusal = { head: headOf(root), subjects: subjectsOf(root), status: statusOf(root) }
		await stopProcess(pid)
		const committed = await runIn({ cwd: root, argv: [folder] })

		const refusedLines = refused.text.split('\n')
		expect({
			refused: {
				exitCode: refused.exitCode,
				processes: guardLines({ text: refused.text, name: 'processes' }),
				targetLine: refusedLines.findIndex((line) => line.startsWith('✓ target')) >= 0,
				afterTarget:
					refusedLines.findIndex((line) => line.startsWith('✓ target')) <
					refusedLines.findIndex((line) => line.startsWith('✗ processes')),
				...afterRefusal,
			},
			committed: {
				exitCode: committed.exitCode,
				processes: guardLines({ text: committed.text, name: 'processes' }),
				subjects: subjectsOf(root).slice(0, 1),
			},
		}).toEqual({
			refused: {
				exitCode: 2,
				processes: [expect.stringMatching(leftBehindPattern({ mark: '✗', pid, guard: true }))],
				targetLine: true,
				afterTarget: true,
				...before,
			},
			committed: {
				exitCode: 0,
				processes: [expect.stringMatching(/^✓ processes /)],
				subjects: ['feat(read): change processes'],
			},
		})
	})

	it('P2 only a direct child of the run (a descendant of the cli own process) works there → ✓ processes, the lot is committed', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'processes', changes: CHANGES })
		startOwnChild({ cwd: root })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			processes: guardLines({ text: run.text, name: 'processes' }),
			subjects: subjectsOf(root).slice(0, 1),
		}).toEqual({
			exitCode: 0,
			processes: [expect.stringMatching(/^✓ processes /)],
			subjects: ['feat(read): change processes'],
		})
	})

	it('the guard reads the processes at run time: the card showed none, a process started after → refused, exit 2', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'processes', changes: CHANGES })
		const shown = cardOf({ root, name: STORE_FIRST_NAME })
		const head = headOf(root)
		const pid = await startLeftBehind({ cwd: root })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			shown: shown.json.processes,
			exitCode: run.exitCode,
			processes: guardLines({ text: run.text, name: 'processes' }),
			head: headOf(root),
		}).toEqual({
			shown: NO_PROCESSES,
			exitCode: 2,
			processes: [expect.stringMatching(leftBehindPattern({ mark: '✗', pid, guard: true }))],
			head,
		})
	})

	it('P11 the process list cannot be read → ✗ processes not known, exit 2, nothing committed', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'processes', changes: CHANGES })
		const head = headOf(root)
		await startLeftBehind({ cwd: root })
		stubSearchPathWith()

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			processes: guardLines({ text: run.text, name: 'processes' }),
			head: headOf(root),
		}).toEqual({
			exitCode: 2,
			processes: [expect.stringMatching(/^✗ processes +not known \(.+\)/)],
			head,
		})
	})

	it('P15 --rehearse with a process left running → ! processes with the same line, the rehearsal goes on and ends rehearsed, the repository untouched', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'processes', changes: CHANGES })
		const head = headOf(root)
		const pid = await startLeftBehind({ cwd: root })

		const run = await runIn({ cwd: root, argv: [folder, '--rehearse'] })

		expect({
			exitCode: run.exitCode,
			processes: guardLines({ text: run.text, name: 'processes' }),
			rehearsed: run.text.includes('rehearsed:'),
			head: headOf(root),
		}).toEqual({
			exitCode: 0,
			processes: [expect.stringMatching(leftBehindPattern({ mark: '!', pid, guard: true }))],
			rehearsed: true,
			head,
		})
	})

	it('only a process the person named works there → ! processes naming it, the run goes on and commits, exit 0', async () => {
		isolateGitConfig()
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'processes', changes: CHANGES })
		const name = nameNodeAsPersonProcess(root)
		await startLeftBehind({ cwd: root })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			processes: guardLines({ text: run.text, name: 'processes' }),
			subjects: subjectsOf(root).slice(0, 1),
		}).toEqual({
			exitCode: 0,
			processes: [expect.stringMatching(new RegExp(`^! processes +open on the worktree: ${name}`))],
			subjects: ['feat(read): change processes'],
		})
	})

	it('P13 a process whose command line holds a forged line and a terminal escape → the ✗ processes line is one line, nothing forged is printed, exit 2', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'processes', changes: CHANGES })
		const pid = await startLeftBehind({ cwd: root, argv0: FORGED_ARGV0 })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			// the forged word is inside the cut command line: the text reaches the printer
			lineHoldsForgedWord: run.text.includes(FORGED_ARGV0_WORD),
			faults: forgedFaultsOf(run.text),
			forgedLines: run.text.split('\n').filter((line) => line.startsWith(FORGED_LINE_START)),
			processes: guardLines({ text: run.text, name: 'processes' }),
		}).toEqual({
			exitCode: 2,
			lineHoldsForgedWord: true,
			faults: [],
			forgedLines: [],
			processes: [
				expect.stringMatching(new RegExp(`^✗ processes +1 left running in the worktree: ${pid} `)),
			],
		})
	})
})

describe(
	'the cli in a shell pipeline: its own pipeline is never left behind',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('R3-1 handover show <name> --json piped to cat from a shell without a terminal, the worktree clean → READY and no process listed (cat is the cli own pipeline)', async () => {
			const root = await gatedRepository()
			writeStoreHandover({ root, name: 'processes' })

			const piped = await runCliThroughCat({
				cwd: root,
				argv: ['handover', 'show', STORE_FIRST_NAME, '--json'],
			})
			const json = JSON.parse(piped.output.slice(piped.output.indexOf('{')))

			expect({
				exitCode: piped.exitCode,
				verdict: json.verdict,
				processes: json.processes,
			}).toEqual({
				exitCode: 0,
				verdict: 'READY',
				processes: NO_PROCESSES,
			})
		})

		it('R3-1 handover show <name> piped to cat → the card holds no processes row', async () => {
			const root = await gatedRepository()
			writeStoreHandover({ root, name: 'processes' })

			const piped = await runCliThroughCat({
				cwd: root,
				argv: ['handover', 'show', STORE_FIRST_NAME],
			})

			expect({
				exitCode: piped.exitCode,
				rows: processRowsOf(piped.output).filter(isNotPassed),
			}).toEqual({ exitCode: 0, rows: [] })
		})

		it('R3-1 handover run <folder> --rehearse piped to cat → the processes guard passes, no ! processes line naming cat, the rehearsal ends rehearsed', async () => {
			const root = createBranchRepository()
			const { folder } = writeStoreHandover({ root, name: 'processes', changes: CHANGES })

			const piped = await runCliThroughCat({
				cwd: root,
				argv: ['handover', 'run', folder, '--rehearse'],
			})

			expect({
				processes: guardLines({ text: piped.output, name: 'processes' }).map((line) =>
					line.slice(0, '✓ processes'.length),
				),
				namesCat: piped.output.split('\n').some((line) => /processes.*\bcat\b/.test(line)),
				rehearsed: piped.output.includes('rehearsed:'),
			}).toEqual({ processes: ['✓ processes'], namesCat: false, rehearsed: true })
		})
	},
)

/** Whether a processes row of the card is not the passing one. */
function isNotPassed(row: string): boolean {
	return !row.startsWith('✓')
}
