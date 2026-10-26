/** What `dialecte <command> [options]` asks for. */
export type Invocation =
	| { kind: 'help' }
	| { kind: 'unknown'; command: string }
	| { kind: 'run'; command: string; argv: string[] }
