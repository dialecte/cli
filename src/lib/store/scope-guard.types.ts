/**
 * Why a lot's work leaves its scope: the reason line (after `✗ scope  `), the command that widens the scope when an add
 * can fix it (without its `next: ` label; none for an unreadable change line or a damaged lot), and one line per
 * outside path holding a glob character, which no add can name (none when no path does).
 */
export type ScopeRefusal = {
	reason: string
	next?: string
	globPaths?: string[]
}

/** The scope guard over a lot's paths: its refusal, or undefined when every path is covered. */
export type ScopeGuard = ScopeRefusal | undefined
