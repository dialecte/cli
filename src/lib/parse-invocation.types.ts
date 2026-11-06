/** What `dialecte <command> [options]` asks for. */
export type Invocation =
	| { kind: 'help'; command?: string; json: boolean }
	| { kind: 'unknown'; command: string }
	| { kind: 'run'; command: string; argv: string[] }
