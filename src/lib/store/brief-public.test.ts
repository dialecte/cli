import { briefWith, checkArgumentsOf, createBriefWorkspace } from '../../../test/brief-workspace.ts'
/**
 * A brief's public fields (33CI CI2a): `summary`, one public sentence a pull request may show, and `issue`, the issue
 * it closes. Both optional; a summary holding a line break, a path, a link, a reference or a forbidden word is refused
 * at the start like every brief field, the refusal naming the field and the rule's label, never the word.
 */
import { FIRST_WORD } from '../../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../../test/forbidden-words-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { checkBrief, checkBriefFields } from './brief.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A summary a pull request may show. */
const PUBLIC_SUMMARY = 'The review rounds keep a public record of their findings and verdicts.'

describe('brief summary and issue - the fields', () => {
	it('a summary and an issue -> no refusal, both in the parsed brief', () => {
		const fields = checkBriefFields({ value: briefWith({ summary: PUBLIC_SUMMARY, issue: 42 }) })

		expect({
			refused: fields.refused,
			summary: fields.brief?.summary,
			issue: fields.brief?.issue,
		}).toEqual({ refused: [], summary: PUBLIC_SUMMARY, issue: 42 })
	})

	it('neither -> no refusal, neither in the parsed brief', () => {
		const fields = checkBriefFields({ value: briefWith() })

		expect({ refused: fields.refused, brief: fields.brief }).toEqual({
			refused: [],
			brief: expect.not.objectContaining({ summary: expect.anything() }),
		})
	})

	for (const [what, summary, detail] of [
		['a line break', 'One line.\nAnother line.', 'summary must be one line'],
		['an empty text', '', 'summary must be a non-empty string'],
		['201 characters', 'a'.repeat(201), 'summary must be at most 200 characters'],
		['a number', 7, 'summary must be a non-empty string'],
	] as const)
		it(`a summary of ${what} -> refused: ${detail}`, () => {
			expect(checkBriefFields({ value: briefWith({ summary }) }).refused).toEqual([
				{ field: 'summary', rule: 'shape', detail },
			])
		})

	for (const [what, summary] of [
		['a plan path', 'Follows implementation-plans/AGENT_TOOLING/BRIEF.md closely.'],
		['a relative path', 'Reads ../notes/plan.md before it starts.'],
		['a link', 'See https://example.org/page for the reasons.'],
		['a file and line', 'Fixes the reader at src/lib/a.ts:12 for good.'],
		['a home path', 'Copies ~/notes into the record.'],
		['a file and line without an extension', 'Fixes the target at Makefile:12 again.'],
		['a bare web link', 'Explained at www.example.org for readers.'],
		['a root path in parentheses', 'Reads the defaults (/etc) once.'],
		['a drive path', 'Copies C:\\notes\\plan.md into the record.'],
	])
		it(`a summary holding ${what} -> refused: summary holds a path or a link`, () => {
			expect(checkBriefFields({ value: briefWith({ summary }) }).refused).toEqual([
				{ field: 'summary', rule: 'public-text', detail: 'summary holds a path or a link' },
			])
		})

	for (const summary of [
		'Adds read/write locks to the store.',
		'Keeps TCP/IP and I/O apart.',
		'Needs a 2/3 majority of the reviews.',
		'Moves to v1.2, e.g. with fewer steps.',
		'Runs at 3:30 each night.',
	])
		it(`an ordinary sentence "${summary}" -> no refusal`, () => {
			expect(checkBriefFields({ value: briefWith({ summary }) }).refused).toEqual([])
		})

	for (const [what, issue] of [
		['zero', 0],
		['a negative number', -3],
		['a fraction', 2.5],
		['a string', '#12'],
	] as const)
		it(`an issue of ${what} -> refused: issue must be a positive integer`, () => {
			expect(checkBriefFields({ value: briefWith({ issue }) }).refused).toEqual([
				{ field: 'issue', rule: 'shape', detail: 'issue must be a positive integer' },
			])
		})
})

describe('brief summary - references and forbidden words', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const [label, summary] of [
		['plan tag', `The records ${'lot'} A3 asked for.`],
		['ticket number', `Closes the gap of ${'#'}1234 in the records.`],
		['section citation', `Records what ${'§'} 6 asks of a review.`],
		['clause citation', `Follows ${'clause'} 7 of the rules.`],
	])
		it(`a summary holding a ${label} -> refused, the refusal names the ${label}`, () => {
			const workspace = createBriefWorkspace()

			expect(
				checkBrief(checkArgumentsOf({ workspace, brief: briefWith({ summary }) })).refused,
			).toEqual([{ field: 'summary', rule: 'public-text', detail: `summary holds a ${label}` }])
		})

	it('a summary holding a word of the forbidden list -> refused, the word never named', () => {
		const workspace = createBriefWorkspace()
		configureMachine({ userFileLines: [FIRST_WORD] })

		expect(
			checkBrief(
				checkArgumentsOf({
					workspace,
					brief: briefWith({ summary: `Records the ${FIRST_WORD} findings.` }),
				}),
			).refused,
		).toEqual([{ field: 'summary', rule: 'public-text', detail: 'summary holds a forbidden word' }])
	})

	it('a public summary and an issue -> checked, both kept', () => {
		const workspace = createBriefWorkspace()

		const checked = checkBrief(
			checkArgumentsOf({ workspace, brief: briefWith({ summary: PUBLIC_SUMMARY, issue: 7 }) }),
		)

		expect({
			refused: checked.refused,
			summary: checked.checked?.summary,
			issue: checked.checked?.issue,
		}).toEqual({ refused: [], summary: PUBLIC_SUMMARY, issue: 7 })
	})
})
