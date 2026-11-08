/** The pid of a process that is alive and is not this one (the test runner's parent), for markers and leftovers of another live writer. */
export function otherLivePid(): number {
	return process.ppid
}
