/**
 * `classifyProcesses`: which of the processes working in a worktree are the run's own (never listed), the person's
 * tools (shown) and left behind (blocking), over hand-written process rows; the command line cut for the card.
 */
import { EDITOR_CANDIDATES } from '../editor/editor.constants.ts'
import { COMMAND_SHOWN_LENGTH } from './stray-processes.constants.ts'
import { classifyProcesses } from './stray-processes.ts'

import { describe, expect, it } from 'vitest'

import type { ClassifyRow, CutRow } from '../../../test/rule-gaps-processes.types.ts'
import type { ProcessRow, StrayProcess, StrayProcesses } from './stray-processes.types.ts'

const WORKTREE = '/scratch/0016-cli'
const OWN_PID = 100
const NO_TTY = '??'
const LINUX_NO_TTY = '?'
const A_TTY = 'ttys004'
const EDITOR_WORDS = EDITOR_CANDIDATES.map((candidate) => candidate.word)
const FIRST_EDITOR = EDITOR_WORDS[0]
const CUSTOM_EDITOR = 'scratch-editor'
const HOST = 'agent-host'

/** The pids of each list (sorted) and why the list is not known. */
function pidsOf(outcome: StrayProcesses): {
	leftBehind: number[]
	tools: number[]
	unknown: string | undefined
} {
	return {
		leftBehind: outcome.leftBehind.map((entry) => entry.pid).sort(),
		tools: outcome.tools.map((entry) => entry.pid).sort(),
		unknown: outcome.unknown,
	}
}

/** A process row: no terminal and the command as its command line, unless said. */
function row(params: {
	pid: number
	ppid: number
	command: string
	tty?: string
	args?: string
	pgid?: number
	executable?: string
}): ProcessRow {
	return {
		pid: params.pid,
		ppid: params.ppid,
		pgid: params.pgid ?? params.pid,
		tty: params.tty ?? NO_TTY,
		command: params.command,
		...(params.executable === undefined ? {} : { executable: params.executable }),
		args: params.args ?? params.command,
	}
}

/** The pids as working in the worktree. */
function inWorktree(...pids: number[]): { pid: number; folder: string }[] {
	return pids.map((pid) => ({ pid, folder: WORKTREE }))
}

/** `word` as the macOS app process names it: its first letter capitalised, under an app bundle. */
function appProcessOf(word: string): string {
	return `/Applications/Scratch.app/Contents/MacOS/${word.charAt(0).toUpperCase()}${word.slice(1)}`
}

const INIT = row({ pid: 1, ppid: 0, command: '/sbin/launchd' })

const ROWS: ClassifyRow[] = [
	{
		title:
			'P2 the cli pid, its ancestors (the shell, the host) and its descendants (a hook and its child) working there → none listed, while a watcher beside them is left behind',
		working: inWorktree(80, 90, 100, 110, 120, 200),
		rows: [
			INIT,
			row({ pid: 80, ppid: 1, command: `/opt/${HOST}/bin/${HOST}` }),
			row({ pid: 90, ppid: 80, command: '/bin/zsh' }),
			row({ pid: 100, ppid: 90, command: '/usr/local/bin/node' }),
			row({ pid: 110, ppid: 100, command: '/usr/bin/git' }),
			row({ pid: 120, ppid: 110, command: '/usr/local/bin/node' }),
			row({ pid: 200, ppid: 1, command: '/usr/local/bin/node' }),
		],
		expected: { leftBehind: [200], tools: [] },
	},
	{
		title:
			'P2 an ancestor shell with a terminal and a descendant of the cli with a terminal → neither is a tool nor left behind',
		working: inWorktree(90, 100, 110),
		rows: [
			INIT,
			row({ pid: 90, ppid: 1, command: '/bin/zsh', tty: A_TTY }),
			row({ pid: 100, ppid: 90, command: '/usr/local/bin/node', tty: A_TTY }),
			row({ pid: 110, ppid: 100, command: '/usr/bin/less', tty: A_TTY }),
		],
		expected: { leftBehind: [], tools: [] },
	},
	{
		title:
			'P2 a sibling of the cli in its process group (the other command of its pipeline), no terminal, working there → not listed, while a process of another group under the same shell is left behind',
		working: inWorktree(100, 130, 140),
		rows: [
			INIT,
			row({ pid: 90, ppid: 1, command: '/bin/zsh', pgid: 90 }),
			row({ pid: 100, ppid: 90, command: '/usr/local/bin/node', pgid: 95 }),
			row({ pid: 130, ppid: 90, command: '/usr/bin/cat', pgid: 95 }),
			row({ pid: 140, ppid: 90, command: '/usr/local/bin/node', pgid: 140 }),
		],
		expected: { leftBehind: [140], tools: [] },
	},
	{
		title:
			'P2 a sibling of the cli in its process group whose own parent is another process, no terminal → not listed',
		working: inWorktree(100, 150),
		rows: [
			INIT,
			row({ pid: 90, ppid: 1, command: '/bin/zsh', pgid: 95 }),
			row({ pid: 100, ppid: 90, command: '/usr/local/bin/node', pgid: 95 }),
			row({ pid: 150, ppid: 1, command: '/usr/bin/python3', pgid: 95 }),
		],
		expected: { leftBehind: [], tools: [] },
	},
	{
		title: 'P3 an interactive shell with a terminal, no relation to the cli → a tool',
		working: inWorktree(300),
		rows: [INIT, row({ pid: 300, ppid: 1, command: '/bin/zsh', tty: A_TTY })],
		expected: { leftBehind: [], tools: [300] },
	},
	{
		title: 'P3 a Linux terminal name (pts/3) → a tool',
		working: inWorktree(301),
		rows: [INIT, row({ pid: 301, ppid: 1, command: '/bin/bash', tty: 'pts/3' })],
		expected: { leftBehind: [], tools: [301] },
	},
	{
		title: 'P3 the Linux no-terminal mark (?) → left behind',
		working: inWorktree(302),
		rows: [INIT, row({ pid: 302, ppid: 1, command: '/usr/bin/node', tty: LINUX_NO_TTY })],
		expected: { leftBehind: [302], tools: [] },
	},
	{
		title: 'P3 an empty terminal field → left behind',
		working: inWorktree(303),
		rows: [INIT, row({ pid: 303, ppid: 1, command: '/usr/bin/node', tty: '' })],
		expected: { leftBehind: [303], tools: [] },
	},
	{
		title:
			'P4 an editor app process (its name capitalised, under an app bundle) and its helpers (children and a grandchild, no terminal) → all tools',
		working: inWorktree(400, 401, 402),
		rows: [
			INIT,
			row({ pid: 400, ppid: 1, command: appProcessOf(FIRST_EDITOR) }),
			row({
				pid: 401,
				ppid: 400,
				command: '/Applications/Scratch.app/Contents/Frameworks/Helper (Plugin)',
			}),
			row({ pid: 402, ppid: 401, command: '/usr/local/bin/node' }),
		],
		expected: { leftBehind: [], tools: [400, 401, 402] },
	},
	{
		title:
			'P4 an editor word as a plain command name → a tool, and a helper child working there while the editor itself works elsewhere → a tool',
		working: inWorktree(410, 412),
		rows: [
			INIT,
			row({ pid: 410, ppid: 1, command: `/usr/local/bin/${FIRST_EDITOR}` }),
			row({ pid: 411, ppid: 1, command: `/usr/local/bin/${FIRST_EDITOR}` }),
			row({ pid: 412, ppid: 411, command: '/usr/local/bin/node' }),
		],
		expected: { leftBehind: [], tools: [410, 412] },
	},
	{
		title:
			'P4 the word of the editor configured by the person (added to the editor words) as a command name → a tool',
		working: inWorktree(420),
		rows: [INIT, row({ pid: 420, ppid: 1, command: `/opt/scratch/${CUSTOM_EDITOR}` })],
		editorWords: [...EDITOR_WORDS, CUSTOM_EDITOR],
		expected: { leftBehind: [], tools: [420] },
	},
	{
		title:
			'P4 on Linux an editor run through a symlink (its command the link name, its executable the target) → a tool by its command name',
		working: inWorktree(450),
		rows: [
			INIT,
			row({
				pid: 450,
				ppid: 1,
				command: CUSTOM_EDITOR,
				executable: `/opt/scratch/${CUSTOM_EDITOR}.basic`,
			}),
		],
		editorWords: [...EDITOR_WORDS, CUSTOM_EDITOR],
		expected: { leftBehind: [], tools: [450] },
	},
	{
		title:
			'P4 on Linux a process whose command is its main thread name and whose executable is an editor word → a tool by its executable',
		working: inWorktree(460, 461),
		rows: [
			INIT,
			row({
				pid: 460,
				ppid: 1,
				command: `${CUSTOM_EDITOR}-Main`,
				executable: `/opt/scratch/${CUSTOM_EDITOR}`,
			}),
			row({ pid: 461, ppid: 460, command: '/usr/local/bin/node' }),
		],
		editorWords: [...EDITOR_WORDS, CUSTOM_EDITOR],
		expected: { leftBehind: [], tools: [460, 461] },
	},
	{
		title: 'P4 the same command name when it is not among the editor words → left behind',
		working: inWorktree(430),
		rows: [INIT, row({ pid: 430, ppid: 1, command: `/opt/scratch/${CUSTOM_EDITOR}` })],
		expected: { leftBehind: [430], tools: [] },
	},
	{
		title:
			'P4 a command whose name only starts with an editor word, and one that holds it in a folder name → left behind',
		working: inWorktree(440, 441),
		rows: [
			INIT,
			row({ pid: 440, ppid: 1, command: `/usr/local/bin/${FIRST_EDITOR}x` }),
			row({ pid: 441, ppid: 1, command: `/opt/${FIRST_EDITOR}/bin/node` }),
		],
		expected: { leftBehind: [440, 441], tools: [] },
	},
	{
		title:
			'P5 a working pid with no row (it exited between the two lists) → dropped, the one with a row is left behind',
		working: inWorktree(500, 501),
		rows: [INIT, row({ pid: 501, ppid: 1, command: '/usr/local/bin/node' })],
		expected: { leftBehind: [501], tools: [] },
	},
	{
		title:
			'P8 a test watcher re-parented to pid 1 after its shell ended, no terminal → left behind',
		working: inWorktree(600),
		rows: [
			INIT,
			row({
				pid: 600,
				ppid: 1,
				command: '/usr/local/bin/node',
				args: '/usr/local/bin/node node_modules/.bin/vitest --watch',
			}),
		],
		expected: { leftBehind: [600], tools: [] },
	},
	{
		title:
			'P9 a host process working there, no terminal, not named in the person list (another name is) → left behind',
		working: inWorktree(610),
		rows: [INIT, row({ pid: 610, ppid: 1, command: `/opt/${HOST}/bin/${HOST}` })],
		personWords: ['other-tool'],
		expected: { leftBehind: [610], tools: [] },
	},
	{
		title:
			'P9 on Linux a process the person named whose command is its main thread name (node-MainThread) → a tool by its executable',
		working: inWorktree(620),
		rows: [
			INIT,
			row({
				pid: 620,
				ppid: 1,
				command: `${HOST}-MainThread`,
				executable: `/opt/${HOST}/bin/${HOST}`,
			}),
		],
		personWords: [HOST],
		expected: { leftBehind: [], tools: [620] },
	},
	{
		title:
			'P9 on Linux a process the person named run through a symlink (its executable a versioned target) → a tool by its command name',
		working: inWorktree(630),
		rows: [
			INIT,
			row({ pid: 630, ppid: 1, command: HOST, executable: `/opt/${HOST}/bin/${HOST}3.12` }),
		],
		personWords: [HOST],
		expected: { leftBehind: [], tools: [630] },
	},
	{
		title:
			'P10 the same host named in the person list → a tool, and its own no-terminal background child → left behind',
		working: inWorktree(700, 701),
		rows: [
			INIT,
			row({ pid: 700, ppid: 1, command: `/opt/${HOST}/bin/${HOST}` }),
			row({ pid: 701, ppid: 700, command: '/usr/local/bin/node' }),
		],
		personWords: [HOST],
		expected: { leftBehind: [701], tools: [700] },
	},
	{
		title: 'P10 the person list word and the command name differ in case → a tool',
		working: inWorktree(710),
		rows: [INIT, row({ pid: 710, ppid: 1, command: `/opt/bin/${HOST.toUpperCase()}` })],
		personWords: [HOST],
		expected: { leftBehind: [], tools: [710] },
	},
	{
		title:
			'P10 a person list word that is only a folder name of the command (not its name) → left behind',
		working: inWorktree(720),
		rows: [INIT, row({ pid: 720, ppid: 1, command: `/opt/${HOST}/bin/node` })],
		personWords: [HOST],
		expected: { leftBehind: [720], tools: [] },
	},
	{
		title:
			'one tool, one left behind and one own process together → each in its list, in no list for the own process',
		working: inWorktree(100, 800, 801),
		rows: [
			INIT,
			row({ pid: 100, ppid: 1, command: '/usr/local/bin/node' }),
			row({ pid: 800, ppid: 1, command: '/bin/zsh', tty: A_TTY }),
			row({ pid: 801, ppid: 1, command: '/usr/local/bin/node' }),
		],
		expected: { leftBehind: [801], tools: [800] },
	},
]

describe('classifyProcesses: own, tools, left behind', () => {
	for (const testCase of ROWS) {
		it(testCase.title, () => {
			expect(
				pidsOf(
					classifyProcesses({
						working: testCase.working,
						rows: testCase.rows,
						ownPid: testCase.ownPid ?? OWN_PID,
						editorWords: testCase.editorWords ?? EDITOR_WORDS,
						personWords: testCase.personWords ?? [],
					}),
				),
			).toEqual({
				leftBehind: [...testCase.expected.leftBehind].sort(),
				tools: [...testCase.expected.tools].sort(),
				unknown: undefined,
			})
		})
	}
})

/** A command line of `length` characters: a command word, then filler words. */
function commandLineOf(length: number): string {
	return `node ${'x'.repeat(length)}`.slice(0, length)
}

const CUTS: CutRow[] = [
	{
		title: 'a short command line → shown whole',
		args: 'node server.js --port 3000',
		whole: true,
	},
	{
		title: 'a command line of exactly the shown length → shown whole, no ellipsis',
		args: commandLineOf(COMMAND_SHOWN_LENGTH),
		whole: true,
	},
	{
		title: 'a command line one character over the shown length → cut, ending in an ellipsis',
		args: commandLineOf(COMMAND_SHOWN_LENGTH + 1),
		whole: false,
	},
	{
		title: 'a very long command line → cut, ending in an ellipsis',
		args: commandLineOf(COMMAND_SHOWN_LENGTH * 10),
		whole: false,
	},
]

describe('classifyProcesses: the command line the card shows', () => {
	for (const testCase of CUTS) {
		it(testCase.title, () => {
			expect(
				shownOf({
					args: testCase.args,
					shown: classifyProcesses(cutCallOf(testCase.args)).leftBehind[0],
				}),
			).toEqual({
				pid: 900,
				folder: WORKTREE,
				whole: testCase.whole,
				ellipsis: !testCase.whole,
				prefixKept: true,
				length: expect.any(Number),
			})
			// a cut is the shown length, the ellipsis counted in it or added to it
			expect(
				classifyProcesses(cutCallOf(testCase.args)).leftBehind[0]?.command.length,
			).toBeGreaterThanOrEqual(testCase.whole ? testCase.args.length : COMMAND_SHOWN_LENGTH)
			expect(
				classifyProcesses(cutCallOf(testCase.args)).leftBehind[0]?.command.length,
			).toBeLessThanOrEqual(testCase.whole ? testCase.args.length : COMMAND_SHOWN_LENGTH + 1)
		})
	}
})

/** The call that classes one process, left behind, whose command line is `args`. */
function cutCallOf(args: string): Parameters<typeof classifyProcesses>[0] {
	return {
		working: inWorktree(900),
		rows: [INIT, row({ pid: 900, ppid: 1, command: '/usr/local/bin/node', args })],
		ownPid: OWN_PID,
		editorWords: EDITOR_WORDS,
		personWords: [],
	}
}

/** What the card shows of the process `shown`, whose command line is `args`. */
function shownOf(params: { args: string; shown: StrayProcess | undefined }): {
	pid: number | undefined
	folder: string | undefined
	whole: boolean
	ellipsis: boolean | undefined
	prefixKept: boolean | undefined
	length: number | undefined
} {
	const { args, shown } = params
	return {
		pid: shown?.pid,
		folder: shown?.folder,
		whole: shown?.command === args,
		ellipsis: shown?.command.endsWith('…'),
		prefixKept: shown?.command.startsWith(args.slice(0, COMMAND_SHOWN_LENGTH - 1)),
		length: shown?.command.length,
	}
}
