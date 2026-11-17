import { scratchRoot, systemTemporaryFolder } from './scratch-root.ts'

import type { ScratchContext } from './scratch.types.ts'

/**
 * The folders the cli's scratch is looked for in: the scratch root, then the system's temporary folder, where cli
 * versions before the scratch root made their folders (read for one release); one entry when they are the same.
 */
export function scratchReadRoots(params: ScratchContext = {}): string[] {
	return [...new Set([scratchRoot(params), systemTemporaryFolder()])]
}
