import type { HealthFinding } from '../lib/health/health.types.ts'

/** What `runHealth` takes: where it runs, the words after `health`, and the seams the tests inject. */
export type HealthParams = {
	cwd: string
	/** The words after the command: the options. */
	argv: string[]
	/** The clock; the process's by default. */
	now?: Date
	/** The folder scratch folders are looked for in; the system's temporary folder by default. */
	tmp?: string
	/** The store list read; the machine's by default. */
	listPath?: string
	/** Whether a process is alive; the machine's by default. */
	isAlive?: (pid: number) => boolean
}

/** `health --json`. */
export type HealthJson = {
	since: string
	findings: HealthFinding[]
	counts: { red: number; amber: number }
}
