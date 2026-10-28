import type { CommandOutput } from '../lib/command-output.types.ts'
import type { MethodEntry } from '../lib/discover.types.ts'

/** The method entries an expression is read from, or the answer that says why there are none. */
export type MemberEntriesRead =
	| { kind: 'entries'; entries: MethodEntry[]; expression: string }
	| { kind: 'output'; output: CommandOutput }
