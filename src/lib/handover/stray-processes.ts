/**
 * The processes working inside a worktree that nothing of the run's own tree explains: each is the person's tool
 * (a terminal, an editor and its helpers, a name from `git config dialecte.personProcesses`) or left behind.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readlinkSync } from 'node:fs'
import { basename } from 'node:path'

import { EDITOR_CANDIDATES, EDITOR_CONFIG_KEY } from '../editor/editor.constants.ts'
import { splitWords } from '../editor/split-words.ts'
import { readGitConfig } from '../git.ts'
import { WORD_SEPARATOR } from '../rules/forbidden-words.constants.ts'
import { listProcessFolders, processesWorkingIn } from '../worktree/process-folders.ts'
import { PROCESS_LIST_TIMEOUT_MS } from '../worktree/worktree.constants.ts'
import {
	COMMAND_CUT_MARK,
	COMMAND_SHOWN_LENGTH,
	DELETED_EXECUTABLE_SUFFIX,
	LEFT_BEHIND_DETAIL,
	NO_PROCESSES_DETAIL,
	NO_TERMINAL_MARKS,
	PERSON_PROCESSES_KEY,
	PROC_EXECUTABLE_LINK,
	PROCESSES_NOT_KNOWN_DETAIL,
	PS_ARGS_HEADERS,
	PS_ARGS_ROW_PATTERN,
	PS_LOCALE,
	PS_TREE_HEADERS,
	PS_TREE_ROW_START_PATTERN,
	TOOLS_DETAIL,
} from './stray-processes.constants.ts'

import type { ProcessFolder } from '../worktree/worktree.types.ts'
import type {
	ProcessRow,
	StrayProcess,
	StrayProcesses,
	StrayProcessesLine,
} from './stray-processes.types.ts'

/**
 * Classes the processes working in the worktree. Own (never listed): `ownPid`, its ancestors up to pid 1, its
 * descendants, every process of its process group. A tool: a controlling terminal, the process's or an ancestor's
 * name (command or executable basename) an editor word, the process's own name a person word (its children are not
 * covered). Left behind: the rest. A working pid without a row exited meanwhile and is dropped.
 */
export function classifyProcesses(params: {
	working: readonly ProcessFolder[]
	rows: readonly ProcessRow[]
	ownPid: number
	editorWords: readonly string[]
	personWords: readonly string[]
}): StrayProcesses {
	const rowOf = new Map(params.rows.map((row) => [row.pid, row]))
	const own = ownTreeOf({ rows: params.rows, rowOf, ownPid: params.ownPid })
	const editorWords = new Set(params.editorWords.map((word) => word.toLowerCase()))
	const personWords = new Set(params.personWords.map((word) => word.toLowerCase()))
	const outcome: StrayProcesses = { leftBehind: [], tools: [] }
	for (const entry of params.working) {
		const row = rowOf.get(entry.pid)
		// exited between the folder list and the process list
		if (row === undefined || own.has(row.pid)) continue
		const shown: StrayProcess = {
			pid: row.pid,
			command: cutCommandLine(row.args),
			folder: entry.folder,
		}
		const isTool =
			!NO_TERMINAL_MARKS.includes(row.tty) ||
			namesOf(row).some((name) => personWords.has(name)) ||
			isUnderEditor({ row, rowOf, editorWords })
		;(isTool ? outcome.tools : outcome.leftBehind).push(shown)
	}
	return outcome
}

/**
 * Every process, read by two `ps` lists joined by pid; why they cannot be read when they cannot. The first holds
 * the tree and the executable last (read by the header's positions over ASCII columns), the second the command line
 * last: a column is never read after one whose bytes go beyond ASCII. A pid in one list only started or ended
 * between the two and is dropped.
 */
export function readProcessRows(): ProcessRow[] | string {
	const treeLines = readPsLines({ headers: PS_TREE_HEADERS })
	if (typeof treeLines === 'string') return treeLines
	const argsLines = readPsLines({ headers: PS_ARGS_HEADERS })
	if (typeof argsLines === 'string') return argsLines
	const [treeHeader = '', ...treeRows] = treeLines
	const [argsHeader = '', ...argsRows] = argsLines
	const commandStart = treeHeader.indexOf(PS_TREE_HEADERS.comm)
	if (commandStart < 0 || !argsHeader.includes(PS_ARGS_HEADERS.args))
		return `ps printed an unexpected header (${treeHeader.slice(0, COMMAND_SHOWN_LENGTH)})`
	const argsOf = argsByPid(argsRows)
	const procExecutables = process.platform === 'linux' && existsSync('/proc')
	return treeRows.flatMap(function rowOf(line): ProcessRow[] {
		const start = PS_TREE_ROW_START_PATTERN.exec(line.slice(0, commandStart))
		if (!start) return []
		const pid = Number(start[1])
		const args = argsOf.get(pid)
		// started or ended between the two lists
		if (args === undefined) return []
		return [
			{
				pid,
				ppid: Number(start[2]),
				pgid: Number(start[3]),
				tty: start[4],
				command: line.slice(commandStart).trim(),
				...executableOf({ pid, fromProc: procExecutables }),
				args,
			},
		]
	})
}

/**
 * Linux only: the path `/proc/<pid>/exe` links to, ` (deleted)` cut. Linux's `comm` is the main thread's name, which a
 * program may set (node names it `node-MainThread`) and the kernel cuts at 15 characters; the link resolves
 * symlinks (`vim` runs `vim.basic`), so both names are matched. Nothing when the link cannot be read (another user's
 * process, a kernel thread, gone meanwhile) or elsewhere, where `comm` is the executable's path.
 */
function executableOf(params: { pid: number; fromProc: boolean }): { executable?: string } {
	if (!params.fromProc) return {}
	try {
		const path = readlinkSync(PROC_EXECUTABLE_LINK.replace('{pid}', String(params.pid)))
		return {
			executable: path.endsWith(DELETED_EXECUTABLE_SUFFIX)
				? path.slice(0, -DELETED_EXECUTABLE_SUFFIX.length)
				: path,
		}
	} catch {
		return {}
	}
}

/** The lines `ps` prints for the columns `headers` names (keyword to header), the header line first; or why not. */
function readPsLines(params: { headers: Readonly<Record<string, string>> }): string[] | string {
	const columns = Object.entries(params.headers).map(([keyword, header]) => `${keyword}=${header}`)
	const answer = spawnSync('ps', ['-ww', '-A', '-o', columns.join(',')], {
		// the caller's locale never shapes the list: without UTF-8, ps prints a byte beyond ASCII as `?` or an escape
		env: { ...process.env, LC_ALL: PS_LOCALE },
		encoding: 'utf8',
		maxBuffer: 1e8,
		timeout: PROCESS_LIST_TIMEOUT_MS,
	})
	if (answer.error) return `ps cannot run (${answer.error.message})`
	if (answer.signal) return `ps stopped by ${answer.signal} after ${PROCESS_LIST_TIMEOUT_MS} ms`
	if (answer.status !== 0) return `ps exited ${answer.status}`
	return (answer.stdout ?? '').split('\n')
}

/** Each pid's command line, from the rows of the command-line list. */
function argsByPid(lines: readonly string[]): Map<number, string> {
	const argsOf = new Map<number, string>()
	for (const line of lines) {
		const match = PS_ARGS_ROW_PATTERN.exec(line)
		if (match) argsOf.set(Number(match[1]), (match[2] ?? '').trim())
	}
	return argsOf
}

/**
 * The processes working in `worktree`, classed. `root` is the repository whose git config holds the editor and the
 * person's list. Either reader failing gives nothing listed and `unknown` with why.
 */
export function strayProcesses(params: {
	worktree: string
	root: string
	ownPid?: number
}): StrayProcesses {
	const processes = listProcessFolders()
	if (typeof processes === 'string') return { leftBehind: [], tools: [], unknown: processes }
	const working = processesWorkingIn({ processes, folder: params.worktree })
	// nothing works there: no process list to read
	if (working.length === 0) return { leftBehind: [], tools: [] }
	const rows = readProcessRows()
	if (typeof rows === 'string') return { leftBehind: [], tools: [], unknown: rows }
	return classifyProcesses({
		working,
		rows,
		ownPid: params.ownPid ?? process.pid,
		editorWords: editorWordsOf(params.root),
		personWords: personWordsOf(params.root),
	})
}

/**
 * What the card and the `processes` guard say: the processes left behind and how to stop them (failed), why the
 * list is not known or the person's tools (a warning), else that none runs there.
 */
export function strayProcessesLineOf(processes: StrayProcesses): StrayProcessesLine {
	if (processes.unknown !== undefined)
		return {
			status: 'warning',
			detail: PROCESSES_NOT_KNOWN_DETAIL.replace('{why}', () => processes.unknown ?? ''),
		}
	if (processes.leftBehind.length)
		return {
			status: 'failed',
			detail: LEFT_BEHIND_DETAIL.replace('{count}', String(processes.leftBehind.length))
				.replace('{list}', () =>
					processes.leftBehind.map((entry) => `${entry.pid} ${entry.command}`).join(', '),
				)
				.replace('{pids}', processes.leftBehind.map((entry) => entry.pid).join(' ')),
		}
	if (processes.tools.length)
		return {
			status: 'warning',
			detail: TOOLS_DETAIL.replace('{names}', () =>
				[...new Set(processes.tools.map((entry) => commandWordOf(entry.command)))].join(', '),
			),
		}
	return { status: 'passed', detail: NO_PROCESSES_DETAIL }
}

/**
 * `ownPid`, its ancestors (by parent, up to pid 1), its descendants and every process of its process group (the
 * other commands of the shell pipeline it runs in).
 */
function ownTreeOf(params: {
	rows: readonly ProcessRow[]
	rowOf: ReadonlyMap<number, ProcessRow>
	ownPid: number
}): Set<number> {
	const own = new Set<number>([params.ownPid])
	const ownRow = params.rowOf.get(params.ownPid)
	if (ownRow !== undefined)
		for (const row of params.rows) if (row.pgid === ownRow.pgid) own.add(row.pid)
	let ancestor = ownRow
	while (ancestor !== undefined && ancestor.ppid > 0 && !own.has(ancestor.ppid)) {
		own.add(ancestor.ppid)
		ancestor = params.rowOf.get(ancestor.ppid)
	}
	const childrenOf = new Map<number, number[]>()
	for (const row of params.rows)
		childrenOf.set(row.ppid, [...(childrenOf.get(row.ppid) ?? []), row.pid])
	// breadth first from the own pid; an ancestor is never walked down, so a sibling of the cli stays out
	const descendants = [params.ownPid]
	const seen = new Set<number>(descendants)
	for (let index = 0; index < descendants.length; index += 1)
		for (const child of childrenOf.get(descendants[index]) ?? []) {
			if (seen.has(child)) continue
			seen.add(child)
			own.add(child)
			descendants.push(child)
		}
	return own
}

/** Whether the process's or one of its ancestors' command basename is an editor word. */
function isUnderEditor(params: {
	row: ProcessRow
	rowOf: ReadonlyMap<number, ProcessRow>
	editorWords: ReadonlySet<string>
}): boolean {
	const seen = new Set<number>()
	let current: ProcessRow | undefined = params.row
	while (current !== undefined && !seen.has(current.pid)) {
		if (namesOf(current).some((name) => params.editorWords.has(name))) return true
		seen.add(current.pid)
		current = params.rowOf.get(current.ppid)
	}
	return false
}

/** The names a word is compared with, lower case: the command's basename, and the executable's when there is one. */
function namesOf(row: ProcessRow): string[] {
	const names = [basename(row.command).toLowerCase()]
	if (row.executable !== undefined) names.push(basename(row.executable).toLowerCase())
	return names
}

/** The basename of a command line's first word: the name the card gives a tool. */
function commandWordOf(commandLine: string): string {
	return basename(commandLine.split(/\s/)[0] ?? commandLine)
}

/** The command line as the card shows it: whole up to the shown length, else cut and ending in the mark. */
function cutCommandLine(args: string): string {
	return args.length <= COMMAND_SHOWN_LENGTH
		? args
		: `${args.slice(0, COMMAND_SHOWN_LENGTH - COMMAND_CUT_MARK.length)}${COMMAND_CUT_MARK}`
}

/** The editor list's words and the basename of the first word of `git config dialecte.editor`. */
function editorWordsOf(root: string): string[] {
	const [configured] = splitWords(readGitConfig({ root, key: EDITOR_CONFIG_KEY }) ?? '')
	return [
		...EDITOR_CANDIDATES.map((candidate) => candidate.word),
		...(configured ? [basename(configured)] : []),
	]
}

/** `git config dialecte.personProcesses`, a comma list, each word trimmed. */
function personWordsOf(root: string): string[] {
	return (readGitConfig({ root, key: PERSON_PROCESSES_KEY }) ?? '')
		.split(WORD_SEPARATOR)
		.map((word) => word.trim())
		.filter(Boolean)
}
