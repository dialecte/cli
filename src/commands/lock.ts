/**
 * `dialecte lock run [--no-wait] -- <command> [<argument>...]` - runs a command under the machine-wide
 * lock `gate` and `tdd` take: one heavy run at a time on the machine. The command runs without a shell,
 * its output on the terminal, in the environment the cli was given, with `DIALECTE_MACHINE_LOCK_HOLDER`
 * naming the holder so a `gate` or a `lock run` inside it takes the lock at once. The lock goes when the
 * command ends; `lock run` exits with its code (128 + the signal's number when a signal ended it, 127
 * when it is not found, 126 when it cannot be run).
 */
import { spawn } from 'node:child_process'
import { constants } from 'node:os'

import { GIVEN_ENVIRONMENT } from '../lib/given-environment.constants.ts'
import { MACHINE_LOCK_HOLDER_VARIABLE } from '../lib/machine-lock/machine-lock.constants.ts'
import {
	acquireMachineLock,
	describeHolder,
	machineLockPath,
} from '../lib/machine-lock/machine-lock.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import {
	COMMAND_NOT_FOUND_EXIT_CODE,
	COMMAND_NOT_RUNNABLE_EXIT_CODE,
	LOCK_USAGE,
	SIGNAL_EXIT_CODE_BASE,
} from './lock.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { MachineLockAccess } from '../lib/machine-lock/machine-lock.types.ts'

export async function run(argv: string[]): Promise<void> {
	const [subcommand, ...rest] = argv
	const result =
		subcommand === 'run' ? await runLockRun({ argv: rest }) : { exitCode: 2, output: LOCK_USAGE }
	if (result.output) (result.exitCode === 0 ? console.log : console.error)(result.output)
	process.exit(result.exitCode)
}

/** `lock run`: `argv` is what follows `run`. Resolves when the command ends, with its exit code. */
export async function runLockRun(params: {
	argv: string[]
	/** The machine lock; default: the user's cache folder, the system clock, waiting lines on stderr. */
	machineLock?: MachineLockAccess
	/**
	 * The environment the command gets, plus the holder variable: the one the cli was given (git's
	 * repository variables the cli clears for itself included). Default: the snapshot taken at start.
	 */
	environment?: Readonly<NodeJS.ProcessEnv>
}): Promise<CommandResult> {
	const { argv } = params
	const separator = argv.indexOf('--')
	const options = separator === -1 ? argv : argv.slice(0, separator)
	const words = separator === -1 ? [] : argv.slice(separator + 1)
	if (words.length === 0 || options.some((option) => option !== '--no-wait'))
		return { exitCode: 2, output: LOCK_USAGE }
	const machineLock = params.machineLock ?? {
		path: machineLockPath(),
		clock: createSystemClock(),
		write: (line: string) => console.error(line),
	}
	const outcome = acquireMachineLock({
		path: machineLock.path,
		command: `dialecte lock run -- ${words.join(' ')}`,
		wait: !options.includes('--no-wait'),
		clock: machineLock.clock,
		write: machineLock.write,
		isAlive: machineLock.isAlive,
	})
	if (!outcome.acquired)
		return {
			exitCode: 1,
			output: `lock run: the machine lock is held (--no-wait): ${describeHolder(outcome.holder)}`,
		}
	try {
		return await runCommand({
			words,
			environment: {
				...(params.environment ?? GIVEN_ENVIRONMENT),
				[MACHINE_LOCK_HOLDER_VARIABLE]: outcome.holderVariable,
			},
		})
	} finally {
		outcome.release()
	}
}

/**
 * The command run with the terminal's stdio. While it runs, an interrupt or a termination sent to the
 * whole process group (Ctrl-C) reaches the command and leaves this process waiting for it; a termination
 * sent to this process alone is passed on to the command.
 */
function runCommand(params: {
	words: string[]
	environment: NodeJS.ProcessEnv
}): Promise<CommandResult> {
	const [command, ...commandArguments] = params.words
	return new Promise(function waitForCommand(resolve) {
		const child = spawn(command, commandArguments, {
			stdio: 'inherit',
			env: params.environment,
		})
		function ignoreInterrupt(): void {
			// the command got it too: it decides when to end
		}
		function passOnTermination(): void {
			child.kill('SIGTERM')
		}
		process.on('SIGINT', ignoreInterrupt)
		process.on('SIGTERM', passOnTermination)
		let settled = false
		function settle(result: CommandResult): void {
			if (settled) return
			settled = true
			process.off('SIGINT', ignoreInterrupt)
			process.off('SIGTERM', passOnTermination)
			resolve(result)
		}
		child.on('error', function cannotStart(error: NodeJS.ErrnoException) {
			settle({
				exitCode:
					error.code === 'ENOENT' ? COMMAND_NOT_FOUND_EXIT_CODE : COMMAND_NOT_RUNNABLE_EXIT_CODE,
				output: `lock run: cannot start ${command}: ${error.message}`,
			})
		})
		child.on('exit', function ended(code, signal) {
			settle({
				exitCode: code ?? SIGNAL_EXIT_CODE_BASE + (signal ? constants.signals[signal] : 0),
				output: '',
			})
		})
	})
}
