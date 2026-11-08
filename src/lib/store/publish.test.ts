import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { otherLivePid } from '../../../test/other-live-pid.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { publishOnce, replaceWhole } from './publish.ts'

import { describe, expect, it } from 'vitest'

/** Root writes through a read-only file: the permission cases mean nothing there. */
const RUNS_AS_ROOT = process.getuid?.() === 0

/** A path as a pattern that matches it only. */
function patternOf(path: string): string {
	return path.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function modeOf(path: string): number {
	return statSync(path).mode & 0o777
}

describe('publishOnce', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('no file at the name → written whole, true, only the final name left in the folder', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'a.json')

		expect(publishOnce({ path, text: '{"a":1}\n', readOnly: false })).toBe(true)
		expect(readFileSync(path, 'utf8')).toBe('{"a":1}\n')
		expect(readdirSync(folder)).toEqual(['a.json'])
	})

	it('a file at the name → false, its bytes kept, its temporary unlinked (EEXIST)', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'a.json')
		writeFileSync(path, 'first')

		expect(publishOnce({ path, text: 'second', readOnly: true })).toBe(false)
		expect(readFileSync(path, 'utf8')).toBe('first')
		expect(readdirSync(folder)).toEqual(['a.json'])
	})

	it.each([
		{ readOnly: true, mode: 0o444 },
		{ readOnly: false, mode: 0o644 },
	])('readOnly $readOnly → mode $mode', ({ readOnly, mode }) => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'a.json')

		expect(publishOnce({ path, text: 'x', readOnly })).toBe(true)
		expect(modeOf(path)).toBe(mode)
	})

	it('the temporary written and not yet linked → the final name absent, the temporary holding the whole text', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'a.json')
		const seen: { finalExists: boolean; text: string; name: string }[] = []

		expect(
			publishOnce({
				path,
				text: 'the whole text',
				readOnly: false,
				afterTemporaryWritten: function readerMeanwhile(temporaryPath) {
					seen.push({
						finalExists: existsSync(path),
						text: readFileSync(temporaryPath, 'utf8'),
						name: temporaryPath.slice(folder.length + 1),
					})
				},
			}),
		).toBe(true)
		expect(seen).toHaveLength(1)
		expect(seen[0].finalExists).toBe(false)
		expect(seen[0].text).toBe('the whole text')
		expect(seen[0].name).toMatch(new RegExp(`^a\\.json\\.tmp-${process.pid}-\\d+$`))
	})

	it('a temporary of a dead pid in the folder → removed by this writer; one of another live pid kept', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const dead = `000007.json.tmp-${deadPid()}-3`
		const live = `000008.json.tmp-${otherLivePid()}-3`
		writeFileSync(join(folder, dead), 'half')
		writeFileSync(join(folder, live), 'half')

		expect(publishOnce({ path: join(folder, '000001.json'), text: 'x', readOnly: true })).toBe(true)
		expect(readdirSync(folder).sort()).toEqual(['000001.json', live])
	})

	it.skipIf(RUNS_AS_ROOT)(
		'a published read-only record reached through a symlink → a write through it fails, the record unchanged',
		() => {
			const folder = temporaryFolder('dialecte-publish-')
			const record = join(folder, '000002.json')
			const link = join(folder, 'view.json')

			expect(publishOnce({ path: record, text: 'original', readOnly: true })).toBe(true)
			symlinkSync(record, link)
			expect(() => writeFileSync(link, 'rewritten')).toThrow(/EACCES|EPERM/)
			expect(readFileSync(record, 'utf8')).toBe('original')
		},
	)

	it('the temporary removed under the writer (a leftover sweep of another process) → an error naming the temporary path, nothing published', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'a.json')

		expect(() =>
			publishOnce({
				path,
				text: 'x',
				readOnly: false,
				afterTemporaryWritten: function sweptAway(temporaryPath) {
					unlinkSync(temporaryPath)
				},
			}),
		).toThrow(new RegExp(`${patternOf(path)}\\.tmp-\\d+-\\d+`))
		expect(existsSync(path)).toBe(false)
	})

	it('a name that only exists as a temporary of another file → never counted as taken', () => {
		const folder = temporaryFolder('dialecte-publish-')
		writeFileSync(join(folder, 'a.json.tmp-1-1'), 'half')

		expect(publishOnce({ path: join(folder, 'a.json'), text: 'x', readOnly: false })).toBe(true)
	})
})

describe('replaceWhole', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the temporary removed under the writer → an error naming the temporary path, the old file kept', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'entry.json')
		writeFileSync(path, 'old')

		expect(() =>
			replaceWhole({
				path,
				text: 'new',
				afterTemporaryWritten: function sweptAway(temporaryPath) {
					unlinkSync(temporaryPath)
				},
			}),
		).toThrow(new RegExp(`${patternOf(path)}\\.tmp-\\d+-\\d+`))
		expect(readFileSync(path, 'utf8')).toBe('old')
	})

	it('a file at the path → replaced whole, nothing else left in the folder', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'entry.json')
		writeFileSync(path, 'a much longer first text')

		expect(replaceWhole({ path, text: 'short' })).toBeUndefined()
		expect(readFileSync(path, 'utf8')).toBe('short')
		expect(readdirSync(folder)).toEqual(['entry.json'])
	})

	it('no file at the path → written', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'entry.json')

		expect(replaceWhole({ path, text: 'new' })).toBeUndefined()
		expect(readFileSync(path, 'utf8')).toBe('new')
	})

	it('the temporary written and not yet renamed → the old file still whole, the temporary holding the new text', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const path = join(folder, 'entry.json')
		writeFileSync(path, 'old')
		const seen: { atPath: string; temporary: string }[] = []

		expect(
			replaceWhole({
				path,
				text: 'new',
				afterTemporaryWritten: function readerMeanwhile(temporaryPath) {
					seen.push({
						atPath: readFileSync(path, 'utf8'),
						temporary: readFileSync(temporaryPath, 'utf8'),
					})
				},
			}),
		).toBeUndefined()
		expect(seen).toEqual([{ atPath: 'old', temporary: 'new' }])
		expect(readFileSync(path, 'utf8')).toBe('new')
	})

	it('a temporary of a dead pid in the folder → removed; one of another live pid kept', () => {
		const folder = temporaryFolder('dialecte-publish-')
		const dead = `other.json.tmp-${deadPid()}-1`
		const live = `other.json.tmp-${otherLivePid()}-1`
		writeFileSync(join(folder, dead), 'half')
		writeFileSync(join(folder, live), 'half')

		expect(replaceWhole({ path: join(folder, 'entry.json'), text: 'x' })).toBeUndefined()
		expect(readdirSync(folder).sort()).toEqual(['entry.json', live])
	})
})
