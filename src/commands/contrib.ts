/** `dialecte contrib [--no-reuse] [--json]`: the contributor checks of a dialecte package (`runContrib`). */
import { hasFlag } from '../lib/config.ts'
import { runContrib } from '../lib/contrib/run-contrib.ts'
import { readGivenCheckStore } from '../lib/gate/given-check-store.ts'
import { GIVEN_ENVIRONMENT } from '../lib/given-environment.constants.ts'
import { printOut, textOf } from '../lib/print/print.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'

// the tests and the scratch helpers run the checks through the command
export { runContrib }

export async function run(argv: string[]): Promise<void> {
	// a rehearsal clone's contrib reads and writes the store of the repository it rehearses: an absolute folder only
	const store = readGivenCheckStore({ environment: GIVEN_ENVIRONMENT, command: 'contrib' })
	if (store.ignored) printOut({ stream: 'stdout', text: textOf([store.ignored]) })
	const result = await runContrib({
		cwd: process.cwd(),
		argv,
		...(store.checkStore && { checkStore: store.checkStore }),
		...(!hasFlag(argv, 'json') && { live: openProcessLiveOutput() }),
	})
	printOut({ stream: 'stdout', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}
