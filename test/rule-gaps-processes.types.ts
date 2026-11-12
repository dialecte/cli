import type { ProcessRow } from '../src/lib/handover/stray-processes.types.ts'
import type { ProcessFolder } from '../src/lib/worktree/worktree.types.ts'

/** One case of the `classifyProcesses` table: the processes working in the worktree, the system's rows, the words. */
export type ClassifyRow = {
	/** The case's full title. */
	title: string
	working: ProcessFolder[]
	rows: ProcessRow[]
	/** Default: the running cli's pid of the table, 100. */
	ownPid?: number
	/** Default: every editor word of the editor list. */
	editorWords?: string[]
	/** Default: none. */
	personWords?: string[]
	/** The pids expected left behind and as tools, each list in any order. */
	expected: { leftBehind: number[]; tools: number[] }
}

/** One case of the `processesWorkingIn` table. */
export type WorkingInRow = {
	/** The case's full title. */
	title: string
	/** The pids of the processes whose folders the case builds, and the pids expected back, in the order given. */
	expected: number[]
	/** Builds the processes and the folder asked about inside a real scratch folder. */
	arrange: (base: string) => { processes: ProcessFolder[]; folder: string }
}

/** One case of the command-cut table: a command line and what the card shows of it. */
export type CutRow = {
	/** The case's full title. */
	title: string
	args: string
	/** Whether the shown command is the command line itself, else a cut of it ending in the ellipsis. */
	whole: boolean
}
