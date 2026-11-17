/**
 * The body is the backstop for public text: the record-sourced free text it shows passes the reference, word, plan
 * entry id and path checks before anything is sent; the cli's own rows are not free text.
 */
import { GENERIC_REFERENCE_PATTERNS } from '../rules/committed-text.constants.ts'
import { forbiddenWordPatterns } from '../rules/forbidden-words.ts'
import { publicPiecesOf, publicRefusalOf } from './public-body.ts'

import { describe, expect, it } from 'vitest'

import type { PublicPiece, PullRequestSources } from './pull-request.types.ts'

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
		const sources: PullRequestSources = {
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
			{ record: 'changes/x.md', text: '- E.' },
			{ record: 'overlaps.jsonl', text: 'separate lines' },
		])
	})

	it('a no-entry note → its reason is a piece of its file', () => {
		const sources: PullRequestSources = {
			messages: ['feat(x): x'],
			changelog: { kind: 'none', reason: 'wording only', file: 'changes/x.none.md' },
			treeHash: 'a',
			versionBumped: false,
			release: false,
		}

		expect(publicPiecesOf(sources)).toContainEqual({
			record: 'changes/x.none.md',
			text: 'wording only',
		})
	})
})
