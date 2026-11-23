/**
 * The saved reviews of a lot's design (FIX-design-needs-critic): what a review's text says, where the reviews of a
 * recorded hash stand, and which files of the design's folder are read as reviews.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isolateTemporaryFolders } from '../../../test/design-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readVerdictFolder, verdictOfText, verdictStandingOf } from './design-verdicts.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { VerdictFile, VerdictRead } from './design.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const HASH = 'f32caf8212e2'.padEnd(64, '0')
const EARLIER_HASH = '66f378ffbfc4'.padEnd(64, '1')
const PREFIX = HASH.slice(0, 12)
const EARLIER_PREFIX = EARLIER_HASH.slice(0, 12)
const FENCE = '```'

type ReadCase = { name: string; text: string; expected: VerdictRead }

const verdictCases: ReadCase[] = [
	{
		name: 'Verdict: READY -> ready',
		text: `Design: ${PREFIX}\nVerdict: READY\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
	},
	{
		name: 'VERDICT: READY. -> ready, the key in any case',
		text: `Design: ${PREFIX}\nVERDICT: READY.\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY.' } },
	},
	{
		name: 'Verdict: **READY** (4 MINOR, folded) -> ready, the emphasis removed',
		text: `Design: ${PREFIX}\nVerdict: **READY** (4 MINOR, folded)\n`,
		expected: {
			designs: [PREFIX],
			verdict: { word: 'ready', written: 'READY (4 MINOR, folded)' },
		},
	},
	{
		name: '**Verdict: READY** -> ready, the emphasis around the key stripped',
		text: `Design: ${PREFIX}\n**Verdict: READY**\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
	},
	{
		name: 'Verdict: READY followed by an em dash -> ready',
		text: `Design: ${PREFIX}\nVerdict: READY — fine\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY — fine' } },
	},
	{
		name: 'Verdict: **NOT READY** - 1 blocking -> not ready',
		text: `Design: ${PREFIX}\nVerdict: **NOT READY** - 1 blocking\n`,
		expected: {
			designs: [PREFIX],
			verdict: { word: 'not-ready', written: 'NOT READY - 1 blocking' },
		},
	},
	{
		name: '**Verdict: NOT READY.** -> not ready',
		text: `Design: ${PREFIX}\n**Verdict: NOT READY.**\n`,
		expected: { designs: [PREFIX], verdict: { word: 'not-ready', written: 'NOT READY.' } },
	},
	{
		name: 'Verdict: **READY WITH LOCAL FIXES** - x -> unrecognized',
		text: `Design: ${PREFIX}\nVerdict: **READY WITH LOCAL FIXES** - x\n`,
		expected: {
			designs: [PREFIX],
			verdict: { word: 'unrecognized', written: 'READY WITH LOCAL FIXES - x' },
		},
	},
	{
		name: 'Verdict: ready-ish -> unrecognized, the words in upper case only',
		text: `Design: ${PREFIX}\nVerdict: ready-ish\n`,
		expected: { designs: [PREFIX], verdict: { word: 'unrecognized', written: 'ready-ish' } },
	},
	{
		name: 'a verdict as written longer than 60 characters -> cut at 60',
		text: `Design: ${PREFIX}\nVerdict: ${'X'.repeat(80)}\n`,
		expected: { designs: [PREFIX], verdict: { word: 'unrecognized', written: 'X'.repeat(60) } },
	},
	{
		name: 'two Verdict lines -> the last one is the verdict',
		text: `Design: ${PREFIX}\nVerdict: NOT READY\n\nRound 2.\n\nVerdict: READY\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
	},
	{
		name: 'a fenced Verdict line after a real READY -> ready, the fence never read',
		text: `Design: ${PREFIX}\nVerdict: READY\n\n${FENCE}\nVerdict: NOT READY\n${FENCE}\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
	},
	{
		name: 'a fence indented under a list item -> a fence too, its lines never read',
		text: `Design: ${PREFIX}\nVerdict: READY\n\n- sample:\n  ~~~\n  Verdict: NOT READY\n  ~~~\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
	},
	{
		name: 'a quoted Verdict line after a real READY -> ready, the quote never read',
		text: `Design: ${PREFIX}\nVerdict: READY\n\n> Verdict: NOT READY\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
	},
	{
		name: 'a fence left open at the end -> unrecognized',
		text: `Design: ${PREFIX}\nVerdict: READY\n\n${FENCE}\nVerdict: NOT READY\n`,
		expected: {
			designs: [PREFIX],
			verdict: { word: 'unrecognized', written: 'an unclosed code fence' },
		},
	},
	{
		name: 'no Verdict line -> no verdict',
		text: `Design: ${PREFIX}\n\nThe review goes on.\n`,
		expected: { designs: [PREFIX] },
	},
	{
		name: 'READY followed by a colon, a semicolon, a comma or an en dash -> ready',
		text: `Design: ${PREFIX}\nVerdict: READY: fine\nVerdict: READY; fine\nVerdict: READY, fine\nVerdict: READY \u2013 fine\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY \u2013 fine' } },
	},
	{
		name: 'READY, spaces, then notes -> ready',
		text: `Design: ${PREFIX}\nVerdict: READY   (2 nits)\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY   (2 nits)' } },
	},
	{
		name: 'READY followed by a word -> unrecognized',
		text: `Design: ${PREFIX}\nVerdict: READY now\n`,
		expected: { designs: [PREFIX], verdict: { word: 'unrecognized', written: 'READY now' } },
	},
	{
		name: '__Verdict__: READY -> ready, the underscores stripped around the key',
		text: `Design: ${PREFIX}\n__Verdict__: READY\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
	},
	{
		name: 'a backtick fence indented under a list item -> a fence too, its lines never read',
		text: `Design: ${PREFIX}\nVerdict: READY\n\n- sample:\n  ${FENCE}\n  Verdict: NOT READY\n  ${FENCE}\n`,
		expected: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
	},
]

const designCases: ReadCase[] = [
	{
		name: 'Design: <12 hex> -> names the prefix',
		text: `Design: ${PREFIX}\n`,
		expected: { designs: [PREFIX] },
	},
	{
		name: '**Design:** `<12 hex>…` -> names the prefix, the emphasis and the ellipsis left out',
		text: `**Design:** \`${PREFIX}…\`\n`,
		expected: { designs: [PREFIX] },
	},
	{
		name: 'Design: <12 hex> (rev 4) -> names the prefix',
		text: `Design: ${PREFIX} (rev 4)\n`,
		expected: { designs: [PREFIX] },
	},
	{
		name: 'Design: <upper-case hex> -> names it in lower case',
		text: `design: ${PREFIX.toUpperCase()}\n`,
		expected: { designs: [PREFIX] },
	},
	{
		name: 'two Design lines -> names both',
		text: `Design: ${EARLIER_PREFIX}\nDesign: ${PREFIX}\n`,
		expected: { designs: [EARLIER_PREFIX, PREFIX] },
	},
	{
		name: 'an 11-character hex -> names nothing',
		text: `Design: ${PREFIX.slice(0, 11)}\n`,
		expected: { designs: [] },
	},
	{
		name: 'a hex run spoiled by a letter -> names nothing',
		text: 'Design: abc123def456g\n',
		expected: { designs: [] },
	},
	{
		name: 'a 65-character hex -> names nothing',
		text: `Design: ${HASH}0\n`,
		expected: { designs: [] },
	},
	{
		name: 'a Design key inside a list item or a heading -> names nothing',
		text: `- Design: ${PREFIX}\n## Pass 1: Design: ${PREFIX}\n`,
		expected: { designs: [] },
	},
]

describe('verdictOfText - the verdict', () => {
	it.each(verdictCases)('$name', ({ text, expected }) => {
		expect(verdictOfText({ text })).toEqual(expected)
	})
})

describe('verdictOfText - the design named', () => {
	it.each(designCases)('$name', ({ text, expected }) => {
		expect(verdictOfText({ text })).toEqual(expected)
	})
})

/** A review file as the readers give it, read from `text`. */
function reviewFile(params: { name: string; read: VerdictRead }): VerdictFile {
	return {
		file: `/plans/topic/${params.name}`,
		name: params.name,
		hash: createHash('sha256').update(params.name).digest('hex'),
		text: '',
		read: params.read,
	}
}

const READY_ON_HASH = reviewFile({
	name: 'critic-2.md',
	read: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
})
const NOT_READY_ON_HASH = reviewFile({
	name: 'critic-3.md',
	read: { designs: [PREFIX], verdict: { word: 'not-ready', written: 'NOT READY' } },
})
const UNRECOGNIZED_ON_HASH = reviewFile({
	name: 'critic-4.md',
	read: { designs: [PREFIX], verdict: { word: 'unrecognized', written: 'READY WITH FIXES' } },
})
const READY_ON_EARLIER = reviewFile({
	name: 'critic-1.md',
	read: { designs: [EARLIER_PREFIX], verdict: { word: 'ready', written: 'READY' } },
})
const NO_VERDICT_ON_HASH = reviewFile({ name: 'notes.md', read: { designs: [PREFIX] } })
const READY_ON_BOTH = reviewFile({
	name: 'critic-5.md',
	read: { designs: [EARLIER_PREFIX, PREFIX], verdict: { word: 'ready', written: 'READY' } },
})

const READY_ON_FULL_HASH = reviewFile({
	name: 'critic-6.md',
	read: { designs: [HASH], verdict: { word: 'ready', written: 'READY' } },
})
const READY_ON_LONGER_MISMATCH = reviewFile({
	name: 'critic-7.md',
	read: { designs: [`${PREFIX}f`], verdict: { word: 'ready', written: 'READY' } },
})
const NOT_READY_ON_EARLIER = reviewFile({
	name: 'critic-0.md',
	read: { designs: [EARLIER_PREFIX], verdict: { word: 'not-ready', written: 'NOT READY' } },
})

describe('verdictStandingOf', () => {
	it('a READY file naming the full 64-character hash -> ready', () => {
		expect(verdictStandingOf({ hash: HASH, earlier: [], files: [READY_ON_FULL_HASH] }).state).toBe(
			'ready',
		)
	})

	it('a READY file naming 13 characters whose 13th differs from the hash -> missing', () => {
		expect(
			verdictStandingOf({ hash: HASH, earlier: [], files: [READY_ON_LONGER_MISMATCH] }).state,
		).toBe('missing')
	})

	it('a NOT READY file naming only an earlier hash, a READY one naming the hash -> ready', () => {
		expect(
			verdictStandingOf({
				hash: HASH,
				earlier: [EARLIER_HASH],
				files: [NOT_READY_ON_EARLIER, READY_ON_HASH],
			}).state,
		).toBe('ready')
	})

	it('a READY file naming the hash -> ready', () => {
		expect(
			verdictStandingOf({ hash: HASH, earlier: [EARLIER_HASH], files: [READY_ON_HASH] }),
		).toEqual({
			state: 'ready',
			ready: [READY_ON_HASH],
			blocking: [],
			earlierReady: [],
			noVerdict: [],
		})
	})

	it('nothing naming the hash -> missing, the earlier READY and the files without a verdict listed', () => {
		expect(
			verdictStandingOf({
				hash: HASH,
				earlier: [EARLIER_HASH],
				files: [READY_ON_EARLIER, NO_VERDICT_ON_HASH],
			}),
		).toEqual({
			state: 'missing',
			ready: [],
			blocking: [],
			earlierReady: [{ name: 'critic-1.md', hash: EARLIER_HASH }],
			noVerdict: ['notes.md'],
		})
	})

	it('READY and NOT READY on the hash -> blocked', () => {
		expect(
			verdictStandingOf({
				hash: HASH,
				earlier: [],
				files: [READY_ON_HASH, NOT_READY_ON_HASH],
			}),
		).toEqual({
			state: 'blocked',
			ready: [READY_ON_HASH],
			blocking: [NOT_READY_ON_HASH],
			earlierReady: [],
			noVerdict: [],
		})
	})

	it('an unrecognized verdict on the hash -> blocked', () => {
		expect(
			verdictStandingOf({ hash: HASH, earlier: [], files: [UNRECOGNIZED_ON_HASH] }).state,
		).toBe('blocked')
	})

	it('one READY file naming an earlier hash and the hash -> ready', () => {
		expect(
			verdictStandingOf({ hash: HASH, earlier: [EARLIER_HASH], files: [READY_ON_BOTH] }),
		).toEqual({
			state: 'ready',
			ready: [READY_ON_BOTH],
			blocking: [],
			earlierReady: [],
			noVerdict: [],
		})
	})
})

const READY_TEXT = `Design: ${PREFIX}\nVerdict: READY\n`

/** A plan folder holding the design, read with no shared temporary roots (the cases' folders live there). */
function planFolder(): { folder: string; design: string } {
	const folder = temporaryFolder('review-plan-')
	const design = join(folder, 'DESIGN.md')
	writeFileSync(design, '# Design\n')
	return { folder, design }
}

/** The folder read's parameters for a plan folder, with no shared temporary roots. */
function folderRead(params: { folder: string; design: string }): {
	folder: string
	recorded: string
	recordedHash: string
	cwd: string
	sharedTemporaryRoots: readonly string[]
} {
	return {
		folder: params.folder,
		recorded: params.design,
		recordedHash: HASH,
		cwd: params.folder,
		sharedTemporaryRoots: [],
	}
}

describe('readVerdictFolder', () => {
	it('a READY review beside the design -> read once, with the sha256 of its bytes', () => {
		const plan = planFolder()
		writeFileSync(join(plan.folder, 'critic-1.md'), READY_TEXT)
		isolateTemporaryFolders()

		expect(readVerdictFolder(folderRead(plan))).toEqual([
			expect.objectContaining({
				name: 'critic-1.md',
				hash: createHash('sha256').update(READY_TEXT).digest('hex'),
				text: READY_TEXT,
				read: { designs: [PREFIX], verdict: { word: 'ready', written: 'READY' } },
			}),
		])
	})

	it('a symlinked review pointing into the scratch root -> skipped', () => {
		const plan = planFolder()
		const scratch = join(isolateTemporaryFolders().scratch, 'reviews')
		mkdirSync(scratch, { recursive: true })
		writeFileSync(join(scratch, 'critic-1.md'), READY_TEXT)
		symlinkSync(join(scratch, 'critic-1.md'), join(plan.folder, 'critic-1.md'))

		expect(readVerdictFolder(folderRead(plan))).toEqual([])
	})

	it('a non-UTF-8 and an empty .md -> skipped, no refusal', () => {
		const plan = planFolder()
		writeFileSync(join(plan.folder, 'binary.md'), Buffer.from([0xff, 0xfe, 0xfd]))
		writeFileSync(join(plan.folder, 'empty.md'), '')
		writeFileSync(join(plan.folder, 'critic-1.md'), READY_TEXT)
		isolateTemporaryFolders()

		expect(readVerdictFolder(folderRead(plan))).toEqual([
			expect.objectContaining({ name: 'critic-1.md' }),
		])
	})

	it('the design itself and a link to it -> excluded', () => {
		const plan = planFolder()
		writeFileSync(plan.design, `# Design\n\n${READY_TEXT}`)
		symlinkSync(plan.design, join(plan.folder, 'DESIGN-latest.md'))
		isolateTemporaryFolders()

		expect(readVerdictFolder(folderRead(plan))).toEqual([])
	})

	it('a symlinked review pointing to a READY elsewhere -> read, shown by the name the folder holds', () => {
		const plan = planFolder()
		const elsewhere = join(temporaryFolder('review-elsewhere-'), 'critic-9.md')
		writeFileSync(elsewhere, READY_TEXT)
		symlinkSync(elsewhere, join(plan.folder, 'critic-1.md'))
		isolateTemporaryFolders()

		expect(readVerdictFolder(folderRead(plan))).toEqual([
			expect.objectContaining({
				name: 'critic-1.md',
				read: expect.objectContaining({ designs: [PREFIX] }),
			}),
		])
	})

	it('a copy of the design under another name -> excluded by its hash', () => {
		const plan = planFolder()
		const text = `# Design\n\n${READY_TEXT}`
		writeFileSync(plan.design, text)
		writeFileSync(join(plan.folder, 'DESIGN-copy.md'), text)
		isolateTemporaryFolders()

		expect(
			readVerdictFolder({
				...folderRead(plan),
				recordedHash: createHash('sha256').update(text).digest('hex'),
			}),
		).toEqual([])
	})

	it('a file that is not .md, and a subfolder -> not read', () => {
		const plan = planFolder()
		writeFileSync(join(plan.folder, 'critic-1.txt'), READY_TEXT)
		mkdirSync(join(plan.folder, 'old'))
		writeFileSync(join(plan.folder, 'old', 'critic-1.md'), READY_TEXT)
		isolateTemporaryFolders()

		expect(readVerdictFolder(folderRead(plan))).toEqual([])
	})

	it('the folder gone -> gone', () => {
		const plan = planFolder()

		expect(
			readVerdictFolder(folderRead({ folder: join(plan.folder, 'moved'), design: plan.design })),
		).toBe('gone')
	})
})
