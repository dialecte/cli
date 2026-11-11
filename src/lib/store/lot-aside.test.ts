/**
 * `moveLotAside` (P2.4): the folder of a damaged lot is moved, never deleted, to `<git common folder>/dialecte-lots-aside/
 * <name>` (`-<n>` appended, n = 2, 3, ... while the name is taken, an empty folder included); a `stopped.json` (`reason`,
 * `by`, `at`, `damage`) is written inside the moved folder beside its content; a folder gone before the move answers
 * `gone`; a link is moved as the link, never its target.
 */
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	symlinkSync,
} from 'node:fs'
import { join } from 'node:path'

import { ASIDE_FOLDER, STOPPED_FILE } from '../../../test/damaged-lot-workspace.constants.ts'
import { fileIdentityOf } from '../../../test/damaged-lot-workspace.ts'
import {
	ASIDE_BY,
	ASIDE_LOT_NAME as NAME,
	ASIDE_REASON,
} from '../../../test/lot-aside-workspace.constants.ts'
import { createAsideWorkspace, moveOf, takeName } from '../../../test/lot-aside-workspace.ts'
import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { RECORD_TIME } from '../../../test/store-records.constants.ts'
import { writeRecordFile } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { moveLotAside } from './lot-aside.ts'
import { RECORD_DAMAGE_REASONS } from './store.constants.ts'

import { describe, expect, it } from 'vitest'

describe('moveLotAside', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a free name -> moved whole to dialecte-lots-aside/<name>: the store no longer holds it, its content is there byte for byte, stopped.json beside it', () => {
		const workspace = createAsideWorkspace()
		const before = snapshotOf(workspace.lotFolder)
		const identityBefore = fileIdentityOf({ path: workspace.lotFolder })
		const target = join(workspace.aside, NAME)

		expect(moveOf({ lotFolder: workspace.lotFolder })).toEqual({ state: 'moved', folder: target })

		expect(fileIdentityOf({ path: target })).toBe(identityBefore)
		expect(existsSync(workspace.lotFolder)).toBe(false)
		expect(readdirSync(join(workspace.common, 'dialecte-lots'))).toEqual([])
		const after = snapshotOf(target)
		expect(Object.keys(after).sort()).toEqual([...Object.keys(before), STOPPED_FILE].sort())
		expect(after['brief.json']).toBe(before['brief.json'])
		expect(after['transitions/000001.json']).toBe(before['transitions/000001.json'])
		expect(JSON.parse(after[STOPPED_FILE])).toEqual({
			reason: ASIDE_REASON,
			by: ASIDE_BY,
			at: RECORD_TIME,
			damage: RECORD_DAMAGE_REASONS.identityUnreadable,
		})
	})

	it('the name taken in the aside folder -> <name>-2, the folder there untouched', () => {
		const workspace = createAsideWorkspace()
		takeName({ workspace, name: NAME })
		const earlier = snapshotOf(join(workspace.aside, NAME))

		expect(moveOf({ lotFolder: workspace.lotFolder })).toEqual({
			state: 'moved',
			folder: join(workspace.aside, `${NAME}-2`),
		})

		expect(snapshotOf(join(workspace.aside, NAME))).toEqual(earlier)
	})

	it('<name> and <name>-2 taken -> <name>-3', () => {
		const workspace = createAsideWorkspace()
		takeName({ workspace, name: NAME })
		takeName({ workspace, name: `${NAME}-2` })

		expect(moveOf({ lotFolder: workspace.lotFolder })).toEqual({
			state: 'moved',
			folder: join(workspace.aside, `${NAME}-3`),
		})
	})

	it('an empty folder of that name in the aside folder -> never replaced: <name>-2', () => {
		const workspace = createAsideWorkspace()
		mkdirSync(join(workspace.aside, NAME), { recursive: true })

		expect(moveOf({ lotFolder: workspace.lotFolder })).toEqual({
			state: 'moved',
			folder: join(workspace.aside, `${NAME}-2`),
		})

		expect(readdirSync(join(workspace.aside, NAME))).toEqual([])
	})

	it('the name taken after the free name was chosen, before the move -> <name>-2, what took it untouched', () => {
		const workspace = createAsideWorkspace()
		const before = snapshotOf(workspace.lotFolder)
		let seenAtTheSeam: Record<string, string> | undefined

		expect(
			moveOf({
				lotFolder: workspace.lotFolder,
				beforeMove() {
					seenAtTheSeam = snapshotOf(workspace.lotFolder)
					takeName({ workspace, name: NAME })
				},
			}),
		).toEqual({ state: 'moved', folder: join(workspace.aside, `${NAME}-2`) })

		expect(seenAtTheSeam).toEqual(before)

		expect(readdirSync(join(workspace.aside, NAME))).toEqual(['earlier.txt'])
		expect(existsSync(join(workspace.aside, `${NAME}-2`, STOPPED_FILE))).toBe(true)
	})

	it('the folder gone before the move -> gone, nothing made in the aside folder', () => {
		const workspace = createAsideWorkspace()
		const before = snapshotOf(workspace.lotFolder)
		let seenAtTheSeam: Record<string, string> | undefined

		expect(
			moveOf({
				lotFolder: workspace.lotFolder,
				beforeMove() {
					seenAtTheSeam = snapshotOf(workspace.lotFolder)
					moveOf({ lotFolder: workspace.lotFolder })
				},
			}),
		).toEqual({ state: 'gone' })

		expect(seenAtTheSeam).toEqual(before)

		expect(readdirSync(workspace.aside)).toEqual([NAME])
	})

	it('no folder of that name at all -> gone, the aside folder not made', () => {
		const workspace = createAsideWorkspace()
		const missing = join(workspace.common, 'dialecte-lots', '0008-repo-none')

		expect(moveOf({ lotFolder: missing })).toEqual({ state: 'gone' })

		expect(existsSync(join(workspace.common, ASIDE_FOLDER))).toBe(false)
	})

	it('the lot folder is a link to a folder elsewhere -> the link is moved, never its target: the target holds the same bytes', () => {
		const workspace = createAsideWorkspace()
		const target = join(realpathSync(temporaryFolder('dialecte-target-')), NAME)
		writeRecordFile({ folder: target, name: 'brief.json', text: '{}\n' })
		const link = join(workspace.common, 'dialecte-lots', '0009-repo-linked')
		symlinkSync(target, link)
		const targetBefore = snapshotOf(target)
		const movedLink = join(workspace.aside, '0009-repo-linked')
		const linkIdentityBefore = fileIdentityOf({ path: link })

		expect(moveOf({ lotFolder: link })).toEqual({ state: 'moved', folder: movedLink })

		expect(fileIdentityOf({ path: movedLink })).toBe(linkIdentityBefore)
		expect(lstatSync(movedLink).isSymbolicLink()).toBe(true)
		expect(readlinkSync(movedLink)).toBe(target)
		expect(existsSync(link)).toBe(false)
		expect(snapshotOf(target)).toEqual(targetBefore)
		expect(JSON.parse(readFileSync(`${movedLink}.stopped.json`, 'utf8')) as unknown).toEqual({
			reason: ASIDE_REASON,
			by: ASIDE_BY,
			at: RECORD_TIME,
			damage: RECORD_DAMAGE_REASONS.identityUnreadable,
		})
	})

	it('another damage reason and the caller as by -> stopped.json records them as given', () => {
		const workspace = createAsideWorkspace()

		expect(
			moveLotAside({
				lotFolder: workspace.lotFolder,
				reason: ASIDE_REASON,
				by: 'caller',
				now: new Date(RECORD_TIME),
				damage: RECORD_DAMAGE_REASONS.identityName,
			}),
		).toEqual({ state: 'moved', folder: join(workspace.aside, NAME) })

		expect(JSON.parse(snapshotOf(join(workspace.aside, NAME))[STOPPED_FILE])).toMatchObject({
			by: 'caller',
			damage: RECORD_DAMAGE_REASONS.identityName,
		})
	})
})
