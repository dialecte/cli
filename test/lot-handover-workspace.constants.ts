/** The files a lot's worktree changes before its hand-over is written (inside the default brief's scope). */
export const LOT_CHANGES: Readonly<Record<string, string>> = {
	'src/dataflow/subscribe.ts': 'export function subscribe() {\n\treturn 1\n}\n',
}

/** The time the hand-overs of these tests are written at. */
export const LOT_HANDOVER_NOW = new Date('2026-11-08T13:00:00.000Z')

/** The lot a simulated-lot case holds (index 0002, so a real lot of index 0001 can stand beside it). */
export const SIMULATED_LOT_NAME = '0002-repo-simulated'

/** A branch the lot is not on. */
export const FOREIGN_BRANCH = 'feat/elsewhere'

/** A file the main checkout changes, for a lots file that names the main checkout. */
export const MAIN_CHANGES: Readonly<Record<string, string>> = {
	'src/other.ts': 'export function other() {}\n',
}
