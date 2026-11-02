/**
 * `dialecte <command> [options]`: `--help` or `-h` anywhere before `--` answers with the help and runs
 * nothing, so a command never receives it as an option and never runs by mistake. The words after `--`
 * are the command's own (a finding starting with a dash) and are not read.
 */
import type { Invocation } from './parse-invocation.types.ts'

export function parseInvocation(params: {
	argv: readonly string[]
	commandNames: readonly string[]
}): Invocation {
	const [command, ...rest] = params.argv
	const separator = params.argv.indexOf('--')
	const options = separator === -1 ? params.argv : params.argv.slice(0, separator)
	if (!command || options.includes('--help') || options.includes('-h')) return { kind: 'help' }
	if (!params.commandNames.includes(command)) return { kind: 'unknown', command }
	return { kind: 'run', command, argv: rest }
}
