import type { TreeKiller, TreeSampler } from '../src/lib/progress/run-child.types.ts'

export type FakeTree = {
	sampleTree: TreeSampler
	kill: TreeKiller
	killed: number[][]
	/** How many times the tree was sampled. */
	samples: () => number
	/** The cpu each sample of the root reports; default: no CPU gained. */
	setCpu(cpuMilliseconds: () => number): void
}
