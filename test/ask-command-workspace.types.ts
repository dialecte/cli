import type { StandardWorkspace } from './standard-workspace.types.ts'

/**
 * The temporary tree an `ask` test runs in: a standard workspace (root, cache, home) whose `cwd` holds the test
 * dialecte as an app does, the state and data folders of the test, and the environment that points the command at
 * them. Nothing of it is the real home, state, data, cache or standard.
 */
export type AskCommandWorkspace = StandardWorkspace & {
	/** The folder `XDG_STATE_HOME` names. */
	state: string
	/** The folder `XDG_DATA_HOME` names (the facts ledger lives below it). */
	data: string
}

/** Where the lot cases run: outside every repository, inside the repository, in the lot's worktree. */
export type LotPlace = 'project' | 'repository' | 'worktree'

/** One line of an events file as the tests read it. */
export type ReadEvent = Record<string, unknown> & { kind: string; lot: string | null }

/** What `ask --json` prints, as far as the tests read it. */
export type AskJson = {
	schema: number
	boundary: { answer: { verdict: string; value: string | null }; source: { kind: string } } | null
	conflict: { kind: string; fact: string; outside: string[] } | null
	ask: string
	question: string
	kind: string
	decision: boolean
	rung: number
	state: string
	answer: { verdict: string; value: string | null; text: string } | null
	fact: string | null
	source: string | null
	candidates: { fact: string; why: string }[]
	slices: { id: string; file: string; from: number; to: number }[]
	next: string | null
	effort: { level: string }
	standard: {
		configured: boolean
		documents: boolean
		name: string | null
		key: string | null
		folders: string[]
	}
}
