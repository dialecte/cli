/**
 * `dialecte <command> [options]`: `--help` or `-h` anywhere answers with the help and runs nothing, so a
 * command never receives it as an option and never runs by mistake.
 */
import type { Invocation } from './parse-invocation.types.ts'

export function parseInvocation(params: {
	argv: readonly string[]
	commandNames: readonly string[]
}): Invocation {
	const [command, ...rest] = params.argv
	if (!command || params.argv.includes('--help') || params.argv.includes('-h'))
		return { kind: 'help' }
	if (!params.commandNames.includes(command)) return { kind: 'unknown', command }
	return { kind: 'run', command, argv: rest }
}
