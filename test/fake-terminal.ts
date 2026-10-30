/** A terminal the tests read: lines written, and the live region a spinner and hook lines are redrawn in. */
import type { FakeTerminal } from './fake-terminal.types.ts'

export function createFakeTerminal(params: { tty: boolean; columns?: number }): FakeTerminal {
	const closed: string[] = []
	const rewrites: string[][] = []
	let region: string[] = []
	return {
		output: {
			tty: params.tty,
			columns: params.columns,
			writeLine(line) {
				closed.push(line)
				region = []
			},
			rewriteLines(lines) {
				rewrites.push([...lines])
				region = [...lines]
			},
		},
		screen: () => [...closed, ...region],
		rewrites,
		written: closed,
	}
}
