import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	HANDOVER_PROBE_ANSWER,
	HANDOVER_PROBE_COMMAND,
	HANDOVER_PROBE_FOLDER_PREFIX,
} from './handover.constants.ts'

import type { HandoverProbe } from './handover.types.ts'

/** The repository installs a cli that runs hand-overs: it answers the probe `commit.sh` sends. */
export function probeRepositoryCli(params: Parameters<HandoverProbe>[0]): boolean {
	const [command, ...args] = HANDOVER_PROBE_COMMAND
	// the answer goes to a file, not a pipe: a process the probe left behind cannot hold the wait open
	const folder = mkdtempSync(join(tmpdir(), HANDOVER_PROBE_FOLDER_PREFIX))
	const answerPath = join(folder, 'answer.txt')
	const answer = openSync(answerPath, 'w')
	try {
		const probe = spawnSync(command, args, {
			cwd: params.root,
			stdio: ['ignore', answer, 'ignore'],
			timeout: params.timeout,
			killSignal: 'SIGKILL',
		})
		// a probe that times out is a cli that cannot be trusted to run the hand-over
		return probe.status === 0 && readFileSync(answerPath, 'utf8').includes(HANDOVER_PROBE_ANSWER)
	} finally {
		closeSync(answer)
		rmSync(folder, { recursive: true, force: true })
	}
}
