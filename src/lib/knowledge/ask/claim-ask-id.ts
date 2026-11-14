import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { ASK_ID_DIGITS, ASK_ID_PATTERN, ASK_ID_PREFIX } from './ask.constants.ts'

import type { ClaimAskIdParams } from './ask.types.ts'

/** Claims the next `A-<n>` (four digits) of an `asks` folder by an exclusive create of its folder; the id. */
export function claimAskId(params: ClaimAskIdParams): string {
	const { asksFolder } = params
	mkdirSync(asksFolder, { recursive: true })
	let number = highestAskNumber({ asksFolder }) + 1
	for (;;) {
		const id = askIdOf(number)
		try {
			// not recursive: the create fails when another writer made the folder first
			mkdirSync(join(asksFolder, id))
			return id
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
			number += 1
		}
	}
}

/** The highest number of the `A-<n>` entries of the folder, 0 when none. */
function highestAskNumber(params: { asksFolder: string }): number {
	let highest = 0
	for (const name of readdirSync(params.asksFolder)) {
		const match = ASK_ID_PATTERN.exec(name)
		if (match !== null) highest = Math.max(highest, Number(match[1]))
	}
	return highest
}

/** The id of an ask number: `A-` and the number on four digits or more. */
function askIdOf(number: number): string {
	return `${ASK_ID_PREFIX}${String(number).padStart(ASK_ID_DIGITS, '0')}`
}
