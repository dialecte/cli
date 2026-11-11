/** `dialecte contrib [--no-reuse] [--json]`: the contributor checks of a dialecte package (`runContrib`). */
import { hasFlag } from '../lib/config.ts'
import { runContrib } from '../lib/contrib/run-contrib.ts'
import { printOut } from '../lib/print/print.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'

// the tests and the scratch helpers run the checks through the command
export { runContrib }

export async function run(argv: string[]): Promise<void> {
	const result = await runContrib({
		cwd: process.cwd(),
		argv,
		...(!hasFlag(argv, 'json') && { live: openProcessLiveOutput() }),
	})
	printOut({ stream: 'stdout', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}
