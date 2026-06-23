import { classify } from './audit.ts'

import { describe, expect, it } from 'vitest'

describe('classify (C1–C6 readability causes)', () => {
	it('flags module-noise (C1)', () => {
		expect(classify('Document<Config, typeof import("/x/extensions/y")>')).toContain(
			'C1 module-noise',
		)
	})
	it('flags a wide element-union past 8 tagNames (C2/C4)', () => {
		const s = Array.from({ length: 9 }, (_, i) => `tagName:"E${i}"`).join(' | ')
		expect(classify(s).some((f) => f.startsWith('C2/C4 element-union'))).toBe(true)
	})
	it('flags a wide multi-member input union (C3)', () => {
		// classify flags `> 6` occurrences of `| {`; 8 members → 7 separators → over the line.
		const s = Array.from({ length: 8 }, () => '{ a: 1 }').join(' | ')
		expect(classify(s)).toContain('C3 wide-input-union')
	})
	it('flags the record seam (C5)', () => {
		expect(classify('RawRecord<C,"X"> & { status: "x"; attributes: [] }')).toContain(
			'C5 record-seam',
		)
	})
	it('flags self-referential recursion (C6)', () => {
		expect(classify('{ tree: TreeRecord<C, X>[] }')).toContain('C6 recursive')
	})
	it('returns [] for a clean, concise render', () => {
		expect(classify('Promise<TrackedRecord<"Hitem">[]>')).toEqual([])
	})
})
