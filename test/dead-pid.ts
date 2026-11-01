/** A process id no process holds any more, for markers and locks naming a process that is gone. */
import { spawnSync } from 'node:child_process'

/** The pid of a child that already exited. */
export function deadPid(): number {
	return spawnSync('true').pid
}
