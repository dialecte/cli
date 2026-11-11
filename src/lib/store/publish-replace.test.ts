/**
 * `replaceWhole` over a file that is not an ordinary one, or one a person set a mode on: a symbolic link is refused (the
 * rename would replace the link, not write the file it names), and the file's mode is kept, not forced to 0644.
 */
import {
	chmodSync,
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { PERMISSION_BITS } from '../../../test/lot-questions.constants.ts'
import { LINKED_ENTRY_NAME, MODE_ROWS } from '../../../test/publish-replace.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { replaceWhole } from './publish.ts'

import { describe, expect, it } from 'vitest'

function modeOf(path: string): number {
	return statSync(path).mode & PERMISSION_BITS
}

describe('replaceWhole, a target that is a symbolic link', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a link to a file -> an error naming the link, the link still a link, the file it names unchanged, no temporary left', () => {
		const folder = temporaryFolder('dialecte-replace-')
		const named = join(folder, 'named.json')
		const link = join(folder, LINKED_ENTRY_NAME)
		writeFileSync(named, 'kept')
		symlinkSync(named, link)

		expect(() => replaceWhole({ path: link, text: 'new' })).toThrow(/linked-entry\.json/)
		expect({
			isLink: lstatSync(link).isSymbolicLink(),
			named: readFileSync(named, 'utf8'),
			entries: readdirSync(folder).sort(),
		}).toEqual({ isLink: true, named: 'kept', entries: [LINKED_ENTRY_NAME, 'named.json'] })
	})

	it('a dangling link -> an error naming the link, the link still a link, nothing made at what it names, no temporary left', () => {
		const folder = temporaryFolder('dialecte-replace-')
		const named = join(folder, 'missing.json')
		const link = join(folder, LINKED_ENTRY_NAME)
		symlinkSync(named, link)

		expect(() => replaceWhole({ path: link, text: 'new' })).toThrow(/linked-entry\.json/)
		expect({
			isLink: lstatSync(link).isSymbolicLink(),
			namedExists: existsSync(named),
			entries: readdirSync(folder),
		}).toEqual({ isLink: true, namedExists: false, entries: [LINKED_ENTRY_NAME] })
	})
})

describe('replaceWhole, the mode of the file replaced', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(MODE_ROWS)('a file of mode $octal -> replaced whole, the same mode', ({ mode }) => {
		const folder = temporaryFolder('dialecte-replace-')
		const path = join(folder, 'entry.json')
		writeFileSync(path, 'old')
		chmodSync(path, mode)

		replaceWhole({ path, text: 'new' })

		expect({ text: readFileSync(path, 'utf8'), mode: modeOf(path) }).toEqual({ text: 'new', mode })
	})
})
