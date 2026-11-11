/** A cli process that ran to its end or was killed at its time bound: the streams apart. */
export type CliProcessRun = {
	exitCode: number | null
	stdout: string
	stderr: string
	timedOut: boolean
}
