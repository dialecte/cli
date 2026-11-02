/**
 * The legend of the hand-over card, the one source `dialecte handover --legend` and `dialecte tdd status
 * --legend` print from: every term the card can print, grouped (the verdict, the marks, the commit section,
 * the gate lines, the tdd terms, the card's own terms).
 */
import type { LegendGroup } from './legend.types.ts'

/** The verdict words. */
const VERDICT_TERMS: LegendGroup = [
	{
		term: 'READY',
		meaning: 'no gate failed and none ran on another state of the tree: the lots can be committed',
		look: 'look: the size, then the declarations to read',
	},
	{
		term: 'BLOCKED',
		meaning:
			'a gate failed, never ran, or ran on another state of the tree; the line names each one',
		look: 'look: the gates it names; fix them, then run them again',
	},
	{
		term: 'DONE',
		meaning: 'every lot of the hand-over is committed',
		look: 'look only if a commit in the commit section is not the one you expected',
	},
]

/** The marks of a gate line. */
const MARK_TERMS: LegendGroup = [
	{
		term: '✓',
		meaning: 'the step passed on this tree',
		look: 'look only if its counts surprise you',
	},
	{
		term: '!',
		meaning: 'not run here, or only nits open: it does not block; ran on another tree: it blocks',
		look: 'look: the reason after it; on another tree, run the gate again (a gate run replaces commit hook lines too)',
	},
	{
		term: '✗',
		meaning: 'the step failed, or never ran on this tree: the hand-over is blocked',
		look: 'look: always',
	},
]

/** The terms of the commit section. */
const COMMIT_TERMS: LegendGroup = [
	{
		term: 'pending',
		meaning: 'the lot is not committed yet; its commit sha once it is',
		look: 'look only if a lot you expected is missing',
	},
	{
		term: 'merge',
		meaning:
			'a merge lot: the branch and tip it merges, its conflicts, the tree a rehearsal recorded',
		look: 'look only if it says tree not recorded: rehearse first',
	},
	{
		term: 'HEAD',
		meaning: 'the commit the hand-over starts from; after a run, base → tip and nothing pushed',
		look: 'look only if the base is not the commit you expected',
	},
]

/** The gate lines: each step a gate records, the rules and the review. */
const GATE_TERMS: LegendGroup = [
	{
		term: 'gate',
		meaning: 'no gate record on this tree: dialecte gate never ran here',
		look: 'look: always; run dialecte gate',
	},
	{
		term: 'commit hook',
		meaning:
			'the line comes from the commit hook a hand-over run saw, its own scripts by name (test:run, lint:check, hook); a gate run after it replaces those lines',
		look: 'look only if it is not ✓',
	},
	{
		term: 'from <sha>',
		meaning:
			"the line comes from a record made at a commit outside this branch's history, such as the branch commit a merge brings in",
		look: 'look only if it is not ✓',
	},
	{
		term: 'rehearsal',
		meaning:
			'the line comes from the commit hook of a rehearsal in a scratch clone, which ran on the tree the lots leave',
		look: 'look only if it is not ✓',
	},
	{
		term: 'check',
		meaning: "the package's check script: types, lint, format and the tests it runs",
		look: 'look only if it is not ✓',
	},
	{
		term: 'tests',
		meaning:
			'the tests as passed/run: with --fast those of the changed files, with --full the whole suite',
		look: 'look only if it is not ✓',
	},
	{ term: 'build', meaning: 'the package builds', look: 'look only if it is not ✓' },
	{
		term: 'docs',
		meaning: 'the documentation builds (full gate)',
		look: 'look only if it is not ✓',
	},
	{
		term: 'type-bench',
		meaning: 'the cost of the types stays within its baseline (full gate)',
		look: 'look only if it is not ✓: a type grew in cost',
	},
	{
		term: 'rules',
		meaning: 'dialecte rules on the changed files: the errors and warnings of the house rules',
		look: 'look only if it counts an error or a warning',
	},
	{
		term: 'review',
		meaning: 'the independent review: its rounds and open findings, from the findings ledger',
		look: 'look only if it is not ✓: a finding is open, or no findings ledger means no review recorded',
	},
	{
		term: 'skills',
		meaning: 'the agent skills of the package are generated and in sync with the code',
		look: 'look only if it is not ✓: the generated skills are out of sync with the code (a changed JSDoc counts)',
	},
	{
		term: 'tdd',
		meaning:
			'every new or changed test case has its receipts: red before the code and green after, or unchanged, accepted or revised',
		look: 'look only if it is not ✓; the tdd section says which cases',
	},
]

/** The terms of the tdd section: what `dialecte tdd status --legend` prints. */
export const TDD_LEGEND_TERMS: LegendGroup = [
	{
		term: 'exempt',
		meaning:
			'the lot changes no behaviour, so no case needs a red; the reason and the files touched follow',
		look: 'look: the reason; a lot that changes behaviour is never exempt',
	},
	{
		term: 'proven red → green',
		meaning:
			'cases that failed before the code and pass with it: the test was seen to test something',
		look: 'look only if the count seems low for what the lot changes',
	},
	{
		term: 'unchanged',
		meaning: 'cases passing with their test code the same as at the base: nothing to prove',
		look: 'look only if the lot was meant to change their behaviour',
	},
	{
		term: 'kept',
		meaning:
			'proven cases that passed again at a later red run, after test code around them changed',
		look: 'look: the "test code changed around it" flag line below',
	},
	{
		term: 'accepted',
		meaning: 'cases passing without a red, accepted by the lot with a reason',
		look: 'look: the reasons; each should make sense to you',
	},
	{
		term: 'earlier lots',
		meaning: 'receipts of earlier lots the lot file no longer names, counted per kind',
		look: "look only if you expected this lot's file to name them",
	},
	{
		term: 'revised',
		meaning:
			'cases edited at review (proven before, accepted, unchanged or of the base); the lot gives a reason instead of a new red',
		look: 'look: each one; the edit must not weaken the test',
	},
	{
		term: 'gone',
		meaning: "test cases of the base deleted, with the lot's reason",
		look: 'look: each one; what they tested should still be tested',
	},
	{
		term: 'unused',
		meaning: 'an accept or revised entry of the lot file that no red run used',
		look: 'look: each one; fix or remove it in the lot file',
	},
	{
		term: 'rollback',
		meaning:
			'a red, or a green run proving a case for the first time, taken while the lot moved production code back (a refactor green of cases already green is not flagged)',
		look: 'look: always; ask why the code went back',
	},
	{
		term: 'red after green',
		meaning: 'a green case made red again with production unchanged: its test was changed to fail',
		look: 'look: always; the test may have been bent to fail',
	},
	{
		term: 'test code changed around it',
		meaning:
			'a case proven green whose test code (its own test file or a helper) changed around it after its green',
		look: 'look: each one; the change may weaken what the case proved',
	},
	{
		term: 'helper code changed near unchanged cases (noise)',
		meaning:
			'unchanged cases flagged because test code around them changed; nothing proven is weakened',
		look: 'look only if the count is far above what the change touches',
	},
]

/** The card's own terms. */
const CARD_TERMS: LegendGroup = [
	{
		term: 'declarations to read',
		meaning: 'the tdd lines a person must read before committing: revised, gone and unused entries',
		look: 'look: each one, under to read ↓',
	},
	{
		term: 'notes',
		meaning:
			"the agent's caveats for the person about to run the hand-over; the card after a run has none",
		look: 'look: always',
	},
]

/** Every term the hand-over card can print, in the order `dialecte handover --legend` prints them. */
export const HANDOVER_LEGEND: readonly LegendGroup[] = [
	VERDICT_TERMS,
	MARK_TERMS,
	COMMIT_TERMS,
	GATE_TERMS,
	TDD_LEGEND_TERMS,
	CARD_TERMS,
]

/** Between a term and its meaning. */
export const LEGEND_TERM_SEPARATOR = '  '

/** The indent of a term's look line, and of the wrapped lines of its meaning and look. */
export const LEGEND_INDENT = '  '
