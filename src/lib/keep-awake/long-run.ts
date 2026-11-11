/** The start of a long run (`gate --full` / `--release`, `handover run`): the machine held awake, its clocks read. */
import { createSystemRunClocks, startRunClocks } from '../progress/slept.ts'
import { createAwakeHolder } from './keep-awake.ts'

import type { RunClocks } from '../progress/slept.types.ts'
import type { AwakeHolder } from './keep-awake.types.ts'

/**
 * Holds the machine awake (`holdAwake`, default the production holder) and reads both clocks (`runClocks`, default
 * the process's); the function it answers, called at the run's end, answers how long the machine slept in between,
 * undefined when it did not.
 */
export function startLongRun(params: {
	holdAwake?: AwakeHolder
	runClocks?: RunClocks
}): () => number | undefined {
	const holdAwake = params.holdAwake ?? createAwakeHolder()
	holdAwake()
	return startRunClocks(params.runClocks ?? createSystemRunClocks())
}
