/** The chunks a call wrote to each stream, in order. */
export type CapturedWrites = {
	stdout: string[]
	stderr: string[]
}
