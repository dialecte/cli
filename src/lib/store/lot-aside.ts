/**
 * Moves a damaged lot's folder aside (P2.4): to `<git common folder>/dialecte-lots-aside/<name>` (`-<n>` appended
 * when taken), a `stopped.json` written beside the moved content; never a deletion, never a write into the lot's own
 * records first.
 */
import { lstatSync, mkdirSync, renameSync } from 'node:fs'
import { basename, join } from 'node:path'

import { isPresent } from '../file-system.ts'
import { commonFolderOfLotFolder } from './lot-records.ts'
import { publishOnce, recordText } from './publish.ts'
import {
	ASIDE_FOLDER,
	BARE_NAME_NUMBER,
	STOPPED_FILE,
	STOPPED_LINK_SUFFIX,
} from './store.constants.ts'

import type { MoveLotAsideParams, MovedAside, StoppedRecord } from './lot-aside.types.ts'

/**
 * Moves the lot folder whole, by one rename (same device: its inode kept), to the first free name of the aside
 * folder: `<name>`, then `<name>-2`, `<name>-3`, ...; a name something holds (an empty folder included) is never
 * replaced, one taken between the choice and the rename is passed over. A symbolic link is moved as the link, its
 * target untouched, its record written beside it (`<aside name>.stopped.json`); a folder gets `stopped.json` inside,
 * after the move. `gone` when the folder is not in the store (any more), the aside folder then made only if it was
 * there at the start. A name made empty and taken between the last look and the rename is an accepted residual.
 */
export function moveLotAside(params: MoveLotAsideParams): MovedAside {
	const { lotFolder } = params
	const link = linkOrGone(lotFolder)
	if (link === undefined) return { state: 'gone' }
	const aside = join(commonFolderOfLotFolder(lotFolder), ASIDE_FOLDER)
	mkdirSync(aside, { recursive: true })
	const name = basename(lotFolder)
	let number = firstFreeNumber({ aside, name, link, from: BARE_NAME_NUMBER })
	params.beforeMove?.()
	for (;;) {
		number = firstFreeNumber({ aside, name, link, from: number })
		const target = join(aside, asideNameOf({ name, number }))
		try {
			renameSync(lotFolder, target)
		} catch (error) {
			if (!isPresent(lotFolder)) return { state: 'gone' }
			if (!isTaken({ target, link })) throw error
			number += 1
			continue
		}
		recordStop({ params, target, link })
		return { state: 'moved', folder: target }
	}
}

/** Whether the lot folder is a symbolic link; undefined when nothing is there. */
function linkOrGone(lotFolder: string): boolean | undefined {
	try {
		return lstatSync(lotFolder).isSymbolicLink()
	} catch {
		return undefined
	}
}

/** The first number from `from` whose aside name is free (`BARE_NAME_NUMBER` is the name alone). */
function firstFreeNumber(params: {
	aside: string
	name: string
	link: boolean
	from: number
}): number {
	let number = params.from
	while (
		isTaken({ target: join(params.aside, asideNameOf({ ...params, number })), link: params.link })
	)
		number += 1
	return number
}

/** The aside name of a lot folder: its own name for the bare number, else `<name>-<number>` (2, 3, ...). */
function asideNameOf(params: { name: string; number: number }): string {
	return params.number === BARE_NAME_NUMBER ? params.name : `${params.name}-${params.number}`
}

/** Something holds the name (a moved link also needs its record's name free). */
function isTaken(params: { target: string; link: boolean }): boolean {
	return (
		isPresent(params.target) || (params.link && isPresent(`${params.target}${STOPPED_LINK_SUFFIX}`))
	)
}

/** Publishes `stopped.json` of the moved folder: inside it, or beside a moved link; read-only, never over a file. */
function recordStop(params: { params: MoveLotAsideParams; target: string; link: boolean }): void {
	const { reason, by, now, damage } = params.params
	const record: StoppedRecord = { reason, by, at: now.toISOString(), damage }
	const path = params.link
		? `${params.target}${STOPPED_LINK_SUFFIX}`
		: join(params.target, STOPPED_FILE)
	if (!publishOnce({ path, text: recordText(record), readOnly: true }))
		throw new Error(
			`the lot folder is now ${params.target}, but ${path} exists already: the stop is not recorded`,
		)
}
