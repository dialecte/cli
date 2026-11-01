/**
 * `dialecte` — the Dialecte dialect dev CLI (`@dialecte/cli`). Type-performance benchmarking,
 * coverage probes, and readability audits for any Dialecte dialect (and core itself); the agent skills;
 * the lookups (api, members, schema, doctor); scripts (run, explain); the contributor tools (rules, gate,
 * new verb, handover).
 * Subcommands live in ./commands/* (registered in ./cli.constants.ts); shared zero-config discovery in
 * ./lib/config.ts.
 * Bundled with tsup; the shebang is injected by the tsup banner.
 */
import { COMMANDS, HELP } from './cli.constants.ts'
import {
	clearRepositoryEnvironment,
	ignoredRepositoryEnvironmentLine,
	namesAnotherRepository,
} from './lib/git-environment.ts'
import { GIVEN_ENVIRONMENT } from './lib/given-environment.constants.ts'
import { parseInvocation } from './lib/parse-invocation.ts'

async function main(): Promise<void> {
	// run from a commit hook, git's GIT_DIR and GIT_INDEX_FILE would point every git command at the
	// committed repository; said only when they named another repository than the folder's own
	// GIVEN_ENVIRONMENT was taken when the imports above were evaluated, before this clearing
	const cleared = clearRepositoryEnvironment(process.env)
	if (namesAnotherRepository({ given: GIVEN_ENVIRONMENT, folder: process.cwd() }))
		console.error(ignoredRepositoryEnvironmentLine(cleared))
	const invocation = parseInvocation({
		argv: process.argv.slice(2),
		commandNames: Object.keys(COMMANDS),
	})
	if (invocation.kind === 'help') {
		console.log(HELP.trim())
		return
	}
	if (invocation.kind === 'unknown') {
		console.error(`dialecte: unknown command "${invocation.command}"\n`)
		console.log(HELP.trim())
		process.exit(1)
	}
	await COMMANDS[invocation.command](invocation.argv)
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
