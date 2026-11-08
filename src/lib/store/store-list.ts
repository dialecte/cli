/** The user's store list: one absolute store path per line, so ids see every store of the machine. */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { workTreeHolding } from './store-folder.ts'
import {
	DEFAULT_STATE_SEGMENTS,
	STATE_HOME_VARIABLE,
	STORE_LIST_LINE_SEPARATOR,
	STORE_LIST_SEGMENTS,
} from './store.constants.ts'

import type { StoreListLocation } from './store.types.ts'

/**
 * `$XDG_STATE_HOME/dialecte/lot-stores`, else `<home>/.local/state/dialecte/lot-stores`; the environment and the
 * home default to the process's.
 */
export function storeListPath(params: StoreListLocation): string {
	const environment = params.environment ?? process.env
	// an empty variable is an unset one
	const state =
		environment[STATE_HOME_VARIABLE] || join(params.home ?? homedir(), ...DEFAULT_STATE_SEGMENTS)
	return join(state, ...STORE_LIST_SEGMENTS)
}

/**
 * Appends `store` as one line, with one append, only when the list holds no such line; the folders of the list made.
 * True when it appended. `listPath` defaults to `storeListPath`'s.
 */
export function appendStoreList(params: { store: string; listPath?: string }): boolean {
	const listPath = params.listPath ?? storeListPath({})
	const text = existsSync(listPath) ? readFileSync(listPath, 'utf8') : ''
	if (linesOf(text).includes(params.store)) return false
	mkdirSync(dirname(listPath), { recursive: true })
	// a last line written without its newline keeps its own line
	const separator = text === '' || text.endsWith('\n') ? '' : '\n'
	appendFileSync(listPath, `${separator}${params.store}\n`)
	return true
}

/** The stores of the list: trimmed lines, in order, each once, a path that no longer exists skipped. */
export function readStoreList(params: { listPath?: string }): string[] {
	const listPath = params.listPath ?? storeListPath({})
	if (!existsSync(listPath)) return []
	return [...new Set(linesOf(readFileSync(listPath, 'utf8')))].filter((store) => existsSync(store))
}

/** Why the list may not be used: it would sit inside a git work tree, which is named. Undefined when it is outside every one. */
export function storeListRefusal(params: { listPath?: string }): string | undefined {
	const listPath = params.listPath ?? storeListPath({})
	const workTree = workTreeHolding({ from: dirname(listPath) })
	if (workTree === undefined) return undefined
	return `the store list ${listPath} would sit inside the git work tree ${workTree}: set ${STATE_HOME_VARIABLE} to a folder outside every repository`
}

/** The non-blank lines of the list, trimmed. */
function linesOf(text: string): string[] {
	return text
		.split(STORE_LIST_LINE_SEPARATOR)
		.map((line) => line.trim())
		.filter((line) => line !== '')
}
