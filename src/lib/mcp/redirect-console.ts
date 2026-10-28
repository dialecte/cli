/**
 * stdout is the protocol while serving: whatever a dialecte package prints with `console.log` when it is
 * imported would corrupt a message, so the console's stdout methods write to stderr instead.
 */
export function redirectConsoleToStderr(): void {
	console.log = console.error
	console.info = console.error
	console.debug = console.error
}
