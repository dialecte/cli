/** A row of the closed print rows: how it reads, what its command printed, and the escaped form that print must show. */
export type ClosedRow = {
	title: string
	/** Builds the case in a scratch workspace, runs the real cli, and gives what it printed (standard output then standard error). */
	print: () => Promise<string>
	/** An escaped character of the forged value that the print must show: a fix that stops quoting the value must fail. */
	shows: string
}

/** The files a recap row writes into a hand-over folder, each as its name and text. */
export type FolderFile = {
	name: string
	text: string
}
