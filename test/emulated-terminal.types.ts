import type { LiveStream } from '../src/lib/progress/stream-live-output.types.ts'

/** One character cell of the screen: what it shows and the colour state it was written in. */
export type Cell = { ch: string; style: string }

/** A screen row as a person reads it: its text and the colour state of each of its cells. */
export type EmulatedRow = { text: string; styles: string[] }

/** A small terminal emulator the live output writes to: wraps at the width, scrolls, understands CSI codes. */
export type EmulatedTerminal = {
	stream: LiveStream
	/** A resize to `columns` (the rows stay as they are, no reflow). */
	resize(columns: number): void
	/** Everything a person could scroll through: the scrollback then the screen, trailing blank rows left out. */
	transcript(): string[]
	/** The visible rows with the colour state of their cells. */
	screen(): EmulatedRow[]
	/** The colour state after the last write (empty: the default colours). */
	currentStyle(): string
	/** The most rows the screen held, counting from the top, after any write. */
	maxUsedRows(): number
	/** How many times the bell rang. */
	bells(): number
	/** Every byte written, as written. */
	raw(): string
}
