/** The commands renamed in 1.0 (`record`, `review`, `recap`): each answers with its new name, runs nothing, writes nothing. */
import { answerRenamed } from '../lib/command-map/renamed-answer.ts'
import { RENAMED_EXIT_CODE } from '../lib/command-map/renamed.constants.ts'
import { printOut } from '../lib/print/print.ts'

import type { RenamedCommandName } from '../lib/command-map/command-map.types.ts'

/** The run function of a renamed command: its answer on stderr, exit 2. */
export function renamedCommand(command: RenamedCommandName): (argv: string[]) => Promise<void> {
	return async function run(argv: string[]): Promise<void> {
		printOut({ stream: 'stderr', text: answerRenamed({ command, argv }) })
		process.exit(RENAMED_EXIT_CODE)
	}
}
