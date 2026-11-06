/** The hand-over card as the commands print it, at a terminal's width: a wide one, and a narrow one. */
import { renderSectionCard } from '../card/render-section-card.ts'
import { handoverCardSections } from './handover-card.ts'

import { describe, expect, it } from 'vitest'

import type { HandoverCard } from './handover.types.ts'

/**
 * A card as a merge hand-over writes it before its run: two pending lots - the second a merge with a long
 * message - every gate green, the tdd counts, an accepted reason and a revised case to read.
 */
const CARD: HandoverCard = {
	repository: '/Users/dev/Dialecte/core',
	worktree: '/Users/dev/Dialecte/.worktrees/core-retro-rules',
	branch: 'main',
	head: '2d1cce9a4b7e0f3c5d6e7f8091a2b3c4d5e6f708',
	verdict: 'READY',
	failedGates: [],
	otherTreeGates: [],
	declarations: 1,
	profile: 'consumer',
	gates: [
		{ name: 'check', status: 'passed', detail: '3839 passed · 20 skipped' },
		{ name: 'tdd', status: 'passed', detail: '14/14' },
		{ name: 'rules', status: 'passed', detail: '0 errors · 0 warnings' },
		{ name: 'review', status: 'passed', detail: '2 of 3 rounds · approved' },
	],
	tdd: [
		{ text: '12 proven red → green · 2 unchanged', hang: 0 },
		{ text: '1 accepted', hang: 0 },
		{
			text: '  1  pins the existing settle order',
			hang: 5,
			plain: '1 pins the existing settle order',
		},
		{ text: '1 revised', hang: 0, trailing: 'to read ↓' },
		{
			text: '  revised  src/store/engine.test.ts › engine > settles the import before a foreign write',
			hang: 11,
			cut: true,
			plain:
				'revised src/store/engine.test.ts › engine > settles the import before a foreign write',
		},
		{
			text: '           the review asked for the settle to be awaited',
			hang: 11,
			plain: 'the review asked for the settle to be awaited',
		},
	],
	lots: [
		{
			index: 1,
			fileCount: 3,
			insertions: 120,
			deletions: 4,
			subject: 'fix(store): the engine settles every import before a foreign write',
			pending: true,
		},
		{
			index: 2,
			fileCount: 12,
			insertions: 310,
			deletions: 87,
			subject:
				"merge: the skills' retro rules - a fix's red comes from the reviewed tree, nothing under .git by hand, git-spawning tests clear the hook's variables (docs/retro-rules)",
			pending: true,
			merge: 'merge docs/retro-rules at 6e6622d · 0 conflicts · tree 5481e99',
		},
	],
	command: "cd '/Users/dev/Dialecte/_commit-plan/core-retro-rules' && bash commit.sh",
}

/** At 80 columns every commit line leaves its message room: the layout of the commit section is unchanged. */
const CARD_AT_80_COLUMNS = [
	'┌─ hand-over: core main ───────────────────────────────────────────────────────┐',
	'│ READY  2 lots · 15 files · +430 −91 · all gates green                        │',
	'│        1 declaration to read (below)                                         │',
	'├─ commit ─────────────────────────────────────────────────────────────────────┤',
	'│ pending  3 files   +120 −4   fix(store): the engine settles every import     │',
	'│                              before a foreign write                          │',
	"│ pending  12 files  +310 −87  merge: the skills' retro rules - a fix's red    │",
	'│                              comes from the reviewed tree, nothing under     │',
	'│                              .git by hand, git-spawning tests clear the      │',
	"│                              hook's variables (docs/retro-rules)             │",
	'│                              merge docs/retro-rules at 6e6622d · 0 conflicts │',
	'│                              · tree 5481e99                                  │',
	'│ HEAD 2d1cce9                                                                 │',
	'│ worktree .worktrees/core-retro-rules                                         │',
	'├─ gates ──────────────────────────────────────────────────────────────────────┤',
	'│ ✓ check   3839 passed · 20 skipped                                           │',
	'│ ✓ tdd     14/14                                                              │',
	'│ ✓ rules   0 errors · 0 warnings                                              │',
	'│ ✓ review  2 of 3 rounds · approved                                           │',
	'├─ tdd ────────────────────────────────────────────────────────────────────────┤',
	'│ 12 proven red → green · 2 unchanged                                          │',
	'│ 1 accepted                                                                   │',
	'│   1  pins the existing settle order                                          │',
	'│ 1 revised                                                          to read ↓ │',
	'│   revised  src/store/engine.test.ts › engine > settles the import before a … │',
	'│            the review asked for the settle to be awaited                     │',
	'└─ dialecte handover --legend · details: dialecte tdd status ──────────────────┘',
].join('\n')

/**
 * At 40 columns the sha, files and +/− columns leave a message 7 columns: each message goes on its own
 * lines under its lot's line, 2 columns in, wrapped to the box's width (the merge line too).
 */
const CARD_AT_40_COLUMNS = [
	'┌─ hand-over: core main ───────────────┐',
	'│ READY  2 lots · 15 files · +430 −91  │',
	'│        · all gates green             │',
	'│        1 declaration to read (below) │',
	'├─ commit ─────────────────────────────┤',
	'│ pending  3 files   +120 −4           │',
	'│   fix(store): the engine settles     │',
	'│   every import before a foreign      │',
	'│   write                              │',
	'│ pending  12 files  +310 −87          │',
	"│   merge: the skills' retro rules - a │",
	"│   fix's red comes from the reviewed  │",
	'│   tree, nothing under .git by hand,  │',
	'│   git-spawning tests clear the       │',
	"│   hook's variables                   │",
	'│   (docs/retro-rules)                 │',
	'│   merge docs/retro-rules at 6e6622d  │',
	'│   · 0 conflicts · tree 5481e99       │',
	'│ HEAD 2d1cce9                         │',
	'│ worktree .worktrees/core-retro-rules │',
	'├─ gates ──────────────────────────────┤',
	'│ ✓ check   3839 passed · 20 skipped   │',
	'│ ✓ tdd     14/14                      │',
	'│ ✓ rules   0 errors · 0 warnings      │',
	'│ ✓ review  2 of 3 rounds · approved   │',
	'├─ tdd ────────────────────────────────┤',
	'│ 12 proven red → green · 2 unchanged  │',
	'│ 1 accepted                           │',
	'│   1  pins the existing settle order  │',
	'│ 1 revised                  to read ↓ │',
	'│   revised  src/store/engine.test.ts  │',
	'│            › engine > settles the    │',
	'│            import before a foreign   │',
	'│            write                     │',
	'│            the review asked for the  │',
	'│            settle to be awaited      │',
	'├──────────────────────────────────────┤',
	'│ dialecte handover --legend ·         │',
	'│ details: dialecte tdd status         │',
	'└──────────────────────────────────────┘',
].join('\n')

/** The same card, its merge lot resolving one conflict. */
const CARD_WITH_A_CONFLICT: HandoverCard = {
	...CARD,
	lots: [
		CARD.lots[0],
		{ ...CARD.lots[1], merge: 'merge docs/retro-rules at 6e6622d · 1 conflict · tree 5481e99' },
	],
}

/**
 * At 34 columns (a terminal seen too narrow for the commit columns): each lot's sha and stats on a line,
 * its message and its merge line under it, 2 columns in, wrapped to the box's width; every other line keeps
 * at least 20 columns of text: the revised entry and its reason both come back to column 10, the reason's own
 * indent with them, and the entry wraps whole instead of being cut; its path, wider than the room after the
 * hang, takes a row of its own 2 columns in, whole.
 */
const CARD_AT_34_COLUMNS = [
	'┌─ hand-over: core main ─────────┐',
	'│ READY  2 lots · 15 files ·     │',
	'│        +430 −91 · all gates    │',
	'│        green                   │',
	'│        1 declaration to read   │',
	'│        (below)                 │',
	'├─ commit ───────────────────────┤',
	'│ pending  3 files   +120 −4     │',
	'│   fix(store): the engine       │',
	'│   settles every import before  │',
	'│   a foreign write              │',
	'│ pending  12 files  +310 −87    │',
	"│   merge: the skills' retro     │",
	"│   rules - a fix's red comes    │",
	'│   from the reviewed tree,      │',
	'│   nothing under .git by hand,  │',
	'│   git-spawning tests clear the │',
	"│   hook's variables             │",
	'│   (docs/retro-rules)           │',
	'│   merge docs/retro-rules at    │',
	'│   6e6622d · 1 conflict · tree  │',
	'│   5481e99                      │',
	'│ HEAD 2d1cce9                   │',
	'│ worktree                       │',
	'│   .worktrees/core-retro-rules  │',
	'├─ gates ────────────────────────┤',
	'│ ✓ check   3839 passed · 20     │',
	'│           skipped              │',
	'│ ✓ tdd     14/14                │',
	'│ ✓ rules   0 errors · 0         │',
	'│           warnings             │',
	'│ ✓ review  2 of 3 rounds ·      │',
	'│           approved             │',
	'├─ tdd ──────────────────────────┤',
	'│ 12 proven red → green · 2      │',
	'│ unchanged                      │',
	'│ 1 accepted                     │',
	'│   1  pins the existing settle  │',
	'│      order                     │',
	'│ 1 revised            to read ↓ │',
	'│   revised                      │',
	'│   src/store/engine.test.ts ›   │',
	'│           engine > settles the │',
	'│           import before a      │',
	'│           foreign write        │',
	'│           the review asked for │',
	'│           the settle to be     │',
	'│           awaited              │',
	'├────────────────────────────────┤',
	'│ dialecte handover --legend ·   │',
	'│ details: dialecte tdd status   │',
	'└────────────────────────────────┘',
].join('\n')

/** A box row's text: the frame and the padding left out. */
function rowTexts(box: string): string[] {
	return box
		.split('\n')
		.filter((line) => line.startsWith('│'))
		.map((line) => line.slice('│ '.length).replace(/ *│$/, '').trim())
}

/** The commit section and the title of the card of a numbered worktree, at 80 columns. */
const NUMBERED_CARD_HEAD_AT_80_COLUMNS = [
	'┌─ hand-over: 0171 core main ──────────────────────────────────────────────────┐',
	'│ READY  2 lots · 15 files · +430 −91 · all gates green                        │',
]

describe('the hand-over card of a numbered worktree', () => {
	it('worktree .worktrees/0171-core-retro-rules, index 0171 → the title shows the index once, before the repository folder; the worktree line names the numbered folder', () => {
		const card = renderSectionCard({
			card: handoverCardSections({
				...CARD,
				worktree: '/Users/dev/Dialecte/.worktrees/0171-core-retro-rules',
				index: '0171',
			}),
			colour: false,
			width: 80,
		})

		expect(card.split('\n').slice(0, 2)).toEqual(NUMBERED_CARD_HEAD_AT_80_COLUMNS)
		expect(rowTexts(card)).toContain('worktree .worktrees/0171-core-retro-rules')
	})

	it('the main checkout as the worktree → the line names its folder (core), the title has no index', () => {
		const card = renderSectionCard({
			card: handoverCardSections({ ...CARD, worktree: '/Users/dev/Dialecte/core' }),
			colour: false,
			width: 80,
		})

		expect(card.split('\n')[0]).toMatch(/^┌─ hand-over: core main ─+┐$/)
		expect(rowTexts(card)).toContain('worktree core')
	})

	it('a worktree outside the repository folder (/tmp/elsewhere/wt) → the line holds its absolute path', () => {
		const card = renderSectionCard({
			card: handoverCardSections({ ...CARD, worktree: '/tmp/elsewhere/wt' }),
			colour: false,
			width: 80,
		})

		expect(rowTexts(card)).toContain('worktree /tmp/elsewhere/wt')
	})
})

describe('the hand-over card at a width', () => {
	it('80 columns → the card as before; 40 columns → each commit message on its own lines under its lot, the box exactly 40 wide, no row of a single character', () => {
		const sections = handoverCardSections(CARD)

		expect(renderSectionCard({ card: sections, colour: false, width: 80 })).toBe(CARD_AT_80_COLUMNS)
		const narrow = renderSectionCard({ card: sections, colour: false, width: 40 })
		expect(narrow).toBe(CARD_AT_40_COLUMNS)
		expect(narrow.split('\n').filter((line) => [...line].length !== 40)).toEqual([])
		expect(rowTexts(narrow).filter((text) => text.length === 1)).toEqual([])
	})

	it('34 columns, a merge lot with a long message and its merge line → stacked: sha and stats on a line, the message and the merge line under it at full width; every row 34 wide, none a fragment of 1 to 3 characters', () => {
		const card = renderSectionCard({
			card: handoverCardSections(CARD_WITH_A_CONFLICT),
			colour: false,
			width: 34,
		})

		expect(card).toBe(CARD_AT_34_COLUMNS)
		expect(card.split('\n').filter((line) => [...line].length !== 34)).toEqual([])
		expect(rowTexts(card).filter((text) => text.length <= 3)).toEqual([])
	})

	it('34 columns, an accepted reason holding <NS>, ^<label>: and a & b → printed as written, nothing escaped as markup', () => {
		const tdd = [
			{ text: '1 accepted', hang: 0 },
			{
				text: '  1  keeps <NS>, ^<label>: and a & b as written',
				hang: 5,
				plain: '1 keeps <NS>, ^<label>: and a & b as written',
			},
		]
		const card = renderSectionCard({
			card: handoverCardSections({ ...CARD, tdd }),
			colour: false,
			width: 34,
		})

		expect(rowTexts(card).join(' ')).toContain('keeps <NS>, ^<label>: and a & b as written')
		expect(card).not.toMatch(/&(lt|gt|amp);/)
	})
})
