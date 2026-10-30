/** The part of a Node output stream (`process.stdout`) the live output reads and writes. */
export type LiveStream = {
	isTTY?: boolean
	/** Read at every draw: a terminal can be resized while a step runs. */
	columns?: number
	/** The terminal's height in rows: the live region never fills it. */
	rows?: number
	write(text: string): unknown
}
