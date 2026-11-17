import { systemTemporaryFolder } from './scratch-root.ts'
import { POSIX_SHORT_ROOT } from './scratch.constants.ts'

/**
 * The folders cli versions before the scratch root made their scratch in, read for one release: the system's
 * temporary folder, then, on a POSIX system, the short root rehearsals and their hooks' temporary folders used.
 */
export function formerScratchRoots(params: { platform: NodeJS.Platform }): string[] {
	const temporary = systemTemporaryFolder()
	return params.platform === 'win32' ? [temporary] : [...new Set([temporary, POSIX_SHORT_ROOT])]
}
