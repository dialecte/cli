/** A process-tree sampler and a kill the test controls; the root pid it is given is the real child's. */
import type { ProcessSample } from '../src/lib/progress/run-child.types.ts'
import type { FakeTree } from './fake-process-tree.types.ts'

/** The root (the real child) plus a fake grandchild, `sleep 30`, sampled with the given cpu. */
export function createFakeTree(): FakeTree {
	let cpu: () => number = () => 0
	const killed: number[][] = []
	let sampled = 0
	return {
		killed,
		samples: () => sampled,
		setCpu(next) {
			cpu = next
		},
		sampleTree({ rootPid }): ProcessSample[] {
			sampled += 1
			return [
				{ pid: rootPid, state: 'S', cpuMilliseconds: cpu(), command: 'sh -c sleep 30' },
				{ pid: 424242, state: 'R', cpuMilliseconds: 120_000, command: 'node server.js' },
			]
		},
		kill(pids) {
			killed.push(pids)
			// the fake pid is not ours; the real child must not outlive the test
			for (const pid of pids.filter((candidate) => candidate !== 424242)) {
				try {
					process.kill(pid)
				} catch {
					// already gone
				}
			}
		},
	}
}
