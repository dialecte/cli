/** The dead-writer sweep of a publish (decision E5): the record's own temporary files only, files only. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { otherLivePid } from '../../../test/other-live-pid.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { publishOnce, replaceWhole } from './publish.ts'

import { describe, expect, it } from 'vitest'

const RECORD = 'x.json'
const OLD_TEXT = 'old text of the record'
const NEW_TEXT = 'new text of the record'
const HALF_TEXT = 'half a write'

/** What a dead writer left in the folder beside the record, by what it is: the entries it makes, as a snapshot. */
type Leftover = {
	title: string
	/** Written into `folder` for the dead pid. */
	write: (params: { folder: string; pid: number }) => void
	/** What the folder's snapshot must still hold of it. */
	kept: (pid: number) => Record<string, string>
}

const LEFTOVERS: Leftover[] = [
	{
		title: "another record's temporary file (y.json.tmp-<pid>-1)",
		write: ({ folder, pid }) => writeFileSync(join(folder, `y.json.tmp-${pid}-1`), HALF_TEXT),
		kept: (pid) => ({ [`y.json.tmp-${pid}-1`]: HALF_TEXT }),
	},
	{
		title: "a folder named as the record's temporary (x.json.tmp-<pid>-2/ with a file inside)",
		write: ({ folder, pid }) => {
			mkdirSync(join(folder, `x.json.tmp-${pid}-2`))
			writeFileSync(join(folder, `x.json.tmp-${pid}-2`, 'inner.txt'), HALF_TEXT)
		},
		kept: (pid) => ({
			[`x.json.tmp-${pid}-2/`]: 'folder',
			[join(`x.json.tmp-${pid}-2`, 'inner.txt')]: HALF_TEXT,
		}),
	},
	{
		title: 'a foreign file named like a temporary (notes.tmp-<pid>-1)',
		write: ({ folder, pid }) => writeFileSync(join(folder, `notes.tmp-${pid}-1`), HALF_TEXT),
		kept: (pid) => ({ [`notes.tmp-${pid}-1`]: HALF_TEXT }),
	},
]

type Writer = {
	title: string
	/** The record's text before the write: none when the writer needs the name free. */
	before: string | undefined
	write: (path: string) => void
}

const WRITERS: Writer[] = [
	{
		title: 'publishOnce',
		before: undefined,
		write: (path) => {
			publishOnce({ path, text: NEW_TEXT, readOnly: false })
		},
	},
	{
		title: 'replaceWhole',
		before: OLD_TEXT,
		write: (path) => {
			replaceWhole({ path, text: NEW_TEXT })
		},
	},
]

describe('the sweep of a publish', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const writer of WRITERS)
		for (const leftover of LEFTOVERS)
			it(`${writer.title}, a dead pid left ${leftover.title} and the record's own temporary , a live pid's and one of a name ending with the record's -> the dead own one removed, the others byte-identical`, () => {
				const folder = temporaryFolder('dialecte-sweep-')
				const pid = deadPid()
				if (writer.before !== undefined) writeFileSync(join(folder, RECORD), writer.before)
				const live = otherLivePid()
				writeFileSync(join(folder, `${RECORD}.tmp-${pid}-1`), HALF_TEXT)
				writeFileSync(join(folder, `${RECORD}.tmp-${live}-1`), HALF_TEXT)
				writeFileSync(join(folder, `a${RECORD}.tmp-${pid}-1`), HALF_TEXT)
				leftover.write({ folder, pid })

				expect(writer.write(join(folder, RECORD))).toBeUndefined()
				expect(snapshotOf(folder)).toEqual({
					[RECORD]: NEW_TEXT,
					[`${RECORD}.tmp-${live}-1`]: HALF_TEXT,
					[`a${RECORD}.tmp-${pid}-1`]: HALF_TEXT,
					...leftover.kept(pid),
				})
			})
})
