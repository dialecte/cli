/** The runner a base-red scratch package is written for. */
export type BaseRedRunner = 'vitest' | 'node' | 'pytest'

/**
 * A scratch package: the files its base commit holds, the files written in the working tree after it (the lot's
 * change), and the cases or files (`<file>::<name>`, `<file>`) the lot file declares revised.
 */
export type BaseRedPackageParts = {
	runner: BaseRedRunner
	committed: Record<string, string>
	written?: Record<string, string>
	revised?: readonly string[]
}
