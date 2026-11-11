/**
 * `dialecte` — the Dialecte cli (`@dialecte/cli`): discover, use and grow a Dialecte. The lookups (api,
 * members, schema, explain), scripts and fixtures (run, fixture, new), a lot and its checks (lot, gate, tdd,
 * rules, contrib, mutants), the hand-over, the workspace (worktree, doctor, models, skills) and the
 * package's maintenance (bench, coverage, narrowing, audit, text).
 * Subcommands live in ./commands/* (registered in ./cli.constants.ts); the help reads the declared command
 * map (./lib/command-map/); shared zero-config discovery in ./lib/config.ts.
 * Bundled with tsup; the shebang is injected by the tsup banner.
 */
import { COMMANDS, COMMANDS_BY_NAME } from './cli.constants.ts'
import { answerRenamed, isRenamedCommand, renamedJson } from './lib/command-map/renamed-answer.ts'
import {
	listedEntryOf,
	renderCommandJson,
	renderCommandSection,
	renderGlobalHelp,
	renderHelpJson,
} from './lib/command-map/render-help.ts'
import {
	clearRepositoryEnvironment,
	ignoredRepositoryEnvironmentLine,
	namesAnotherRepository,
} from './lib/git-environment.ts'
import { GIVEN_ENVIRONMENT } from './lib/given-environment.constants.ts'
import { HELP_FLAGS } from './lib/parse-invocation.constants.ts'
import { parseInvocation } from './lib/parse-invocation.ts'
import { printLines, printOut } from './lib/print/print.ts'

import type { PrintedText } from './lib/print/print.types.ts'

async function main(): Promise<void> {
	// run from a commit hook, git's GIT_DIR and GIT_INDEX_FILE would point every git command at the
	// committed repository; said only when they named another repository than the folder's own
	// GIVEN_ENVIRONMENT was taken when the imports above were evaluated, before this clearing
	const cleared = clearRepositoryEnvironment(process.env)
	if (namesAnotherRepository({ given: GIVEN_ENVIRONMENT, folder: process.cwd() }))
		printLines({ stream: 'stderr', lines: [ignoredRepositoryEnvironmentLine(cleared)] })
	const argv = process.argv.slice(2)
	const invocation = parseInvocation({ argv, commandNames: Object.keys(COMMANDS) })
	if (invocation.kind === 'help') {
		printOut({
			stream: 'stdout',
			text: helpText({
				command: invocation.command,
				json: invocation.json,
				words: helpWords(argv),
			}),
		})
		return
	}
	if (invocation.kind === 'unknown') {
		printLines({
			stream: 'stderr',
			lines: [`dialecte: unknown command "${invocation.command}"`, ''],
		})
		printOut({ stream: 'stdout', text: renderGlobalHelp() })
		process.exit(1)
	}
	await COMMANDS_BY_NAME[invocation.command](invocation.argv)
}

/**
 * The help asked for: one command's section, else the global help; a renamed command answers what replaced it,
 * with the words given before `--help`.
 */
function helpText(params: { command?: string; json: boolean; words: string[] }): PrintedText {
	const { command, json } = params
	const entry = command === undefined ? undefined : listedEntryOf(command)
	if (command !== undefined && entry)
		return json
			? renderCommandJson({ name: command, entry })
			: renderCommandSection({ name: command, entry })
	if (command !== undefined && isRenamedCommand(command))
		return json
			? renamedJson({ command, argv: params.words })
			: answerRenamed({ command, argv: params.words })
	return json ? renderHelpJson() : renderGlobalHelp()
}

/** The words after the command, without the help and JSON flags read before `--`. */
function helpWords(argv: string[]): string[] {
	const separator = argv.indexOf('--')
	return argv
		.slice(1)
		.filter(
			(word, index) => (separator !== -1 && index + 1 >= separator) || !HELP_FLAGS.includes(word),
		)
}

main().catch(function printFailure(error: unknown) {
	// the message is one value (it may quote a record): one escaped line, a line feed in it printed as \u{a}
	printLines({
		stream: 'stderr',
		lines: [error instanceof Error ? error.message : String(error)],
	})
	process.exit(1)
})
