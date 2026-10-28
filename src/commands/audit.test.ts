import { auditOutputPath, classify } from './audit.ts'

import { describe, expect, it } from 'vitest'

describe('classify (C1–C6 readability causes)', () => {
	it('flags module-noise (C1)', () => {
		expect(classify('Document<Config, typeof import("/x/extensions/y")>')).toContain(
			'C1 module-noise',
		)
	})
	it('flags a wide element-union past 8 tagNames (C2/C4)', () => {
		const rendered = Array.from({ length: 9 }, (_, index) => `tagName:"E${index}"`).join(' | ')
		expect(classify(rendered).some((cause) => cause.startsWith('C2/C4 element-union'))).toBe(true)
	})
	it('flags a wide multi-member input union (C3)', () => {
		// classify flags `> 6` occurrences of `| {`; 8 members → 7 separators → over the line.
		const rendered = Array.from({ length: 8 }, () => '{ a: 1 }').join(' | ')
		expect(classify(rendered)).toContain('C3 wide-input-union')
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

describe('auditOutputPath', () => {
	it('places a relative out dir under the root', () => {
		expect(auditOutputPath({ root: '/work', outDir: './benchmarks/types/v1/generated' })).toBe(
			'/work/benchmarks/types/v1/readability-audit.md',
		)
	})
	it('uses an absolute out dir as is, never under the root', () => {
		expect(auditOutputPath({ root: '/work', outDir: '/tmp/out/v1/generated' })).toBe(
			'/tmp/out/v1/readability-audit.md',
		)
	})
})
