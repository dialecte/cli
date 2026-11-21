/**
 * The body is the backstop for public text: the record-sourced free text it shows passes the reference, word, plan
 * entry id and path checks before anything is sent; the cli's own rows are not free text.
 */
import { GENERIC_REFERENCE_PATTERNS } from '../rules/committed-text.constants.ts'
import { forbiddenWordPatterns } from '../rules/forbidden-words.ts'
import { publicPiecesOf, publicRefusalOf } from './public-body.ts'

import { describe, expect, it } from 'vitest'

import type { PublicPiece, ChangeRequestSources } from './change-request.types.ts'

const PATTERNS = [...GENERIC_REFERENCE_PATTERNS, ...forbiddenWordPatterns(['zorbco'])]
const TREE_FILES = new Set(['src/x.ts', 'changes/x.md', 'src/lib/pr/x.ts'])

/** The refusal of one piece of `text` from the summary, plan entry `CI2a` and `ci2a-lot`, the test tree. */
function refusalOf(text: string) {
	return publicRefusalOf({
		pieces: [{ record: 'brief.json summary', text }],
		patterns: PATTERNS,
		ids: new Set(['CI2a', 'ci2a-lot']),
		treeFiles: TREE_FILES,
	})
}

describe('publicRefusalOf refuses what a public body never holds', () => {
	it.each([
		['plain prose', 'The body follows the records.', undefined],
		['a path the tree holds', 'Reads `src/x.ts` once.', undefined],
		[
			'a forbidden word',
			'Built for Zorbco.',
			{ record: 'brief.json summary', label: 'forbidden word', word: 'Zorbco' },
		],
		[
			'a ticket number',
			`Fixes ${'#'}1234.`,
			{ record: 'brief.json summary', label: 'ticket number', word: `${'#'}1234` },
		],
		[
			'a section citation',
			`As ${'§'} 5 says.`,
			{ record: 'brief.json summary', label: 'section citation', word: `${'§'} 5` },
		],
		[
			'a plan entry id',
			'Done after ci2a.',
			{ record: 'brief.json summary', label: 'plan entry id', word: 'ci2a' },
		],
		[
			'a plan entry id joined by a dot',
			'Folded from ci2a.notes.',
			{ record: 'brief.json summary', label: 'plan entry id', word: 'ci2a' },
		],
		[
			'a plan entry id joined by an underscore',
			'Folded from ci2a_notes.',
			{ record: 'brief.json summary', label: 'plan entry id', word: 'ci2a' },
		],
		[
			'a plan entry id part of a word',
			'Folded from ci2a-lot.',
			{ record: 'brief.json summary', label: 'plan entry id', word: 'ci2a-lot' },
		],
		['a folder of the tree', 'Moves the readers to `src/lib/pr/`.', undefined],
		[
			'a folder outside the tree',
			'Moves them to `plans/a/b/`.',
			{
				record: 'brief.json summary',
				label: 'path outside the tree or a link',
				word: 'plans/a/b/',
			},
		],
		[
			'an absolute path',
			'Read from /Users/x/y.md first.',
			{
				record: 'brief.json summary',
				label: 'path outside the tree or a link',
				word: '/Users/x/y.md',
			},
		],
		[
			'a parent path',
			'Read ../x/y.md first.',
			{ record: 'brief.json summary', label: 'path outside the tree or a link', word: '../x/y.md' },
		],
		[
			'a drive path',
			'Read C:\\x\\y.md first.',
			{
				record: 'brief.json summary',
				label: 'path outside the tree or a link',
				word: 'C:\\x\\y.md',
			},
		],
		[
			'a path outside the tree',
			'See `plans/AGENT/33.md`.',
			{
				record: 'brief.json summary',
				label: 'path outside the tree or a link',
				word: 'plans/AGENT/33.md',
			},
		],
		[
			'a home path',
			'Kept in ~/notes/x.md.',
			{
				record: 'brief.json summary',
				label: 'path outside the tree or a link',
				word: '~/notes/x.md',
			},
		],
		[
			'a link',
			'See https://example.com/x.',
			{
				record: 'brief.json summary',
				label: 'path outside the tree or a link',
				word: 'https://example.com/x',
			},
		],
	])('%s → %j', (_name, text, expected) => {
		expect(refusalOf(text)).toEqual(expected)
	})

	it('several pieces → the first refused one, by record', () => {
		const pieces: PublicPiece[] = [
			{ record: 'brief.json summary', text: 'Fine.' },
			{ record: 'changes/x.md', text: '- Built for zorbco.' },
		]

		expect(
			publicRefusalOf({ pieces, patterns: PATTERNS, ids: new Set(), treeFiles: new Set() }),
		).toEqual({ record: 'changes/x.md', label: 'forbidden word', word: 'zorbco' })
	})
})

describe('publicPiecesOf lists the free text of the records', () => {
	it('a lot with messages, summary, steps and a changelog → each piece with its record; no generated row', () => {
		const sources: ChangeRequestSources = {
			messages: ['feat(x): x', 'test(x): y'],
			summary: 'S.',
			steps: [{ title: 'T', behaviours: ['a -> b', 'c -> d'] }],
			issue: 1234,
			changelog: {
				kind: 'entries',
				entries: [{ section: 'Added', text: '- E.', file: 'changes/x.md' }],
			},
			overlaps: [{ lot: '0007-repo-other', reason: 'separate lines' }],
			treeHash: 'a',
			versionBumped: false,
			release: false,
		}

		expect(publicPiecesOf(sources)).toEqual([
			{ record: 'brief.json lots[0].message', text: 'feat(x): x' },
			{ record: 'brief.json lots[1].message', text: 'test(x): y' },
			{ record: 'brief.json summary', text: 'S.' },
			{ record: 'brief.json steps[0].title', text: 'T' },
			{ record: 'brief.json steps[0].behaviours[0]', text: 'a -> b' },
			{ record: 'brief.json steps[0].behaviours[1]', text: 'c -> d' },
			{ record: 'changes/x.md', text: '- E.', committed: true },
			{ record: 'overlaps.jsonl', text: 'separate lines' },
		])
	})

	it('a no-entry note → its reason is a piece of its file', () => {
		const sources: ChangeRequestSources = {
			messages: ['feat(x): x'],
			changelog: { kind: 'none', reason: 'wording only', file: 'changes/x.none.md' },
			treeHash: 'a',
			versionBumped: false,
			release: false,
		}

		expect(publicPiecesOf(sources)).toContainEqual({
			record: 'changes/x.none.md',
			text: 'wording only',
			committed: true,
		})
	})
})

describe('publicRefusalOf leaves a committed fragment its paths', () => {
	it.each([
		['a link', 'See https://example.com/x.', 'https://example.com/x'],
		['an absolute path', 'Read /Users/x/notes.md.', '/Users/x/notes.md'],
		['a home path', 'Read ~/notes/x.md.', '~/notes/x.md'],
		['a parent path', 'Read ../plans/x.md.', '../plans/x.md'],
	])('a committed line holding %s → refused all the same', (_name, text, word) => {
		const pieces: PublicPiece[] = [{ record: 'changes/x.md', text, committed: true }]

		expect(
			publicRefusalOf({ pieces, patterns: PATTERNS, ids: new Set(), treeFiles: new Set() }),
		).toEqual({
			record: 'changes/x.md',
			label: 'path outside the tree or a link',
			word,
		})
	})

	it('a changelog line naming an ignored file of the cli → passes: the fragment is committed, public already', () => {
		const pieces: PublicPiece[] = [
			{
				record: 'changes/x.md',
				text: '- `lot close` archives `.dialecte/lot.json`.',
				committed: true,
			},
		]

		expect(
			publicRefusalOf({ pieces, patterns: PATTERNS, ids: new Set(), treeFiles: new Set() }),
		).toBeUndefined()
	})

	it('the same words in a summary → refused: a brief is no committed text', () => {
		const pieces: PublicPiece[] = [
			{ record: 'brief.json summary', text: 'Archives `.dialecte/lot.json`.' },
		]

		expect(
			publicRefusalOf({ pieces, patterns: PATTERNS, ids: new Set(), treeFiles: new Set() }),
		).toEqual({
			record: 'brief.json summary',
			label: 'path outside the tree or a link',
			word: '.dialecte/lot.json',
		})
	})
})

describe('publicPiecesOf lists the free cells of the review', () => {
	it("a finding's file, a verdict's vendor and model → pieces of review.jsonl, checked like any text", () => {
		const sources: ChangeRequestSources = {
			messages: ['feat(x): x'],
			review: {
				findings: [{ schema: 1, kind: 'finding', id: 'R1-1', file: 'notes/a/plan.md' }],
				verdicts: [
					{
						schema: 1,
						kind: 'verdict',
						at: '2026-11-17T00:00:00Z',
						by: { kind: 'station', station: 'reviewer' },
						vendor: 'anthropic',
						model: 'claude-opus-5-5',
						verdict: 'approve',
					},
				],
			},
			treeHash: 'a',
			versionBumped: false,
			release: false,
		}

		const pieces = publicPiecesOf(sources)

		expect(pieces.filter((piece) => piece.record === 'review.jsonl')).toEqual([
			{ record: 'review.jsonl', text: 'R1-1' },
			{ record: 'review.jsonl', text: 'notes/a/plan.md' },
			{ record: 'review.jsonl', text: 'anthropic' },
			{ record: 'review.jsonl', text: 'claude-opus-5-5' },
		])
		expect(
			publicRefusalOf({ pieces, patterns: PATTERNS, ids: new Set(), treeFiles: new Set() }),
		).toEqual({
			record: 'review.jsonl',
			label: 'path outside the tree or a link',
			word: 'notes/a/plan.md',
		})
	})
})

describe('publicPiecesOf holds the quality lines', () => {
	it('a quality finding naming a forbidden word → the body refused like any record text', () => {
		const sources: ChangeRequestSources = {
			messages: ['feat(x): x'],
			treeHash: 'a',
			versionBumped: false,
			release: false,
			quality: {
				kind: 'judged',
				base: { commit: 'b'.repeat(40), source: 'lot' },
				notes: [],
				duplicates: [],
				sharedExports: [
					{
						file: 'src/lib/pr/x.ts',
						line: 1,
						name: 'zorbco',
						folder: 'src/lib/pr',
						importers: ['src/lib'],
						changes: ['signature'],
						allowed: false,
					},
				],
				docs: [],
			},
		}

		expect(
			publicRefusalOf({
				pieces: publicPiecesOf(sources),
				patterns: PATTERNS,
				ids: new Set(),
				treeFiles: TREE_FILES,
			}),
		).toEqual(expect.objectContaining({ label: 'forbidden word', word: 'zorbco' }))
	})
})
