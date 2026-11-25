/**
 * Nothing a person wrote on a change request is dropped by a render: the cli records every line it sent above the kept
 * heading (as hashes, per change request, append-only), and a render refuses any line above the kept heading that is
 * neither one of them nor in the new body. A body no record covers falls back to a check of its headings.
 */
import { GENERIC_NOUNS } from '../host/host.constants.ts'
import { FILLED_PARTS } from './change-request.constants.ts'
import { composeChangeRequest } from './compose-change-request.ts'
import {
	aboveKeptLines,
	lineHashOf,
	renderChangeRequest,
	sentRowsOf,
	sentSetOf,
} from './sent-body.ts'

import { describe, expect, it } from 'vitest'

import type { ChangeRequestSources } from './change-request.types.ts'

/** A template with every part the renderer fills under its own heading (the first the summary), then the kept part. */
const TEMPLATE = `${FILLED_PARTS.map((part) => `### ${part === 'summary' ? 'Summary' : part}\n\n<!-- dialecte:${part} -->\n`).join('\n')}
<!-- dialecte:kept -->
### For the reviewer

- [ ] The code is reviewed
`

const SOURCES: ChangeRequestSources = {
	messages: ['fix(x): x'],
	summary: 'X lands.',
	treeHash: 'a'.repeat(64),
	release: false,
}

/** The body the cli renders for `sources` with no change request yet (the renderer, no body to carry). */
function firstBodyOf(sources: ChangeRequestSources = SOURCES): string {
	const text = composeChangeRequest({
		template: TEMPLATE,
		sources,
		nouns: GENERIC_NOUNS,
		kept: undefined,
	})
	if ('refusal' in text) throw new Error(text.refusal)
	return text.body
}

/** The recorded set of change request 7 once the cli sent `bodies` to it. */
function sentAfter(bodies: readonly string[]): ReadonlySet<string> | undefined {
	const rows = bodies.flatMap((body) =>
		sentRowsOf({
			changeRequest: 7,
			at: '2026-11-25T00:00:00.000Z',
			lines: aboveKeptLines({ template: TEMPLATE, body }),
		}),
	)
	return sentSetOf({ rows, changeRequest: 7 })
}

/** A body with `line` inserted after the summary's text. */
function withLineAfterSummary(params: { body: string; line: string }): string {
	return params.body.replace('X lands.\n', `X lands.\n\n${params.line}\n`)
}

/** The render of `sources` over `current`, the record of `sent` bodies (none when undefined). */
function rerender(params: {
	current: string
	sent: readonly string[] | undefined
	sources?: ChangeRequestSources
}) {
	return renderChangeRequest({
		template: TEMPLATE,
		sources: params.sources ?? SOURCES,
		nouns: GENERIC_NOUNS,
		current: params.current,
		sent: params.sent === undefined ? undefined : sentAfter(params.sent),
	})
}

describe('aboveKeptLines reads the lines a render owns', () => {
	it('a body → its lines above the last kept heading, ends trimmed, blank and renderer lines out, boxes untick', () => {
		const body = [
			'### Summary  ',
			'',
			'<!-- dialecte:reviewer-sections -->',
			'- [x] ticked by hand',
			'  1.   [X] ordered',
			'### For the reviewer',
			'quoted once',
			'### For the reviewer',
			'- [x] the person part',
		].join('\r\n')

		expect(aboveKeptLines({ template: TEMPLATE, body })).toEqual([
			'### Summary',
			'- [ ] ticked by hand',
			'- [ ] ordered',
			'### For the reviewer',
			'quoted once',
		])
	})

	it('an empty body or the placeholder an earlier landing wrote → no line', () => {
		expect([
			aboveKeptLines({ template: TEMPLATE, body: '' }),
			aboveKeptLines({
				template: TEMPLATE,
				body: 'Lot 0001-cli-x. The full suite runs on CI; the merge queue lands it.',
			}),
		]).toEqual([[], []])
	})
})

describe('the sent record', () => {
	it('lines → rows of their hashes, each row a JSON line under 4096 bytes; the set is the union of its rows', () => {
		const lines = Array.from({ length: 600 }, (_, index) => `line ${index}`)

		const rows = sentRowsOf({ changeRequest: 7, at: '2026-11-25T00:00:00.000Z', lines })

		expect({
			many: rows.length > 1,
			fit: rows.every((row) => Buffer.byteLength(`${JSON.stringify(row)}\n`) <= 4096),
			set: sentSetOf({ rows, changeRequest: 7 })?.size,
			hash: rows[0]?.lines[0] === lineHashOf('line 0') && lineHashOf('line 0').length === 16,
		}).toEqual({ many: true, fit: true, set: 600, hash: true })
	})

	it('rows of another change request → no set for this one; two rows of this one → both counted', () => {
		const other = sentRowsOf({ changeRequest: 8, at: 'a', lines: ['x'] })
		const mine = [
			...sentRowsOf({ changeRequest: 7, at: 'a', lines: ['x'] }),
			...sentRowsOf({ changeRequest: 7, at: 'b', lines: ['y'] }),
		]

		expect([
			sentSetOf({ rows: other, changeRequest: 7 }),
			sentSetOf({ rows: [...other, ...mine], changeRequest: 7 })?.size,
		]).toEqual([undefined, 2])
	})
})

describe('renderChangeRequest refuses a line the render would drop', () => {
	it('a paragraph a person added after the summary → refused naming it, nothing rendered', () => {
		const first = firstBodyOf()

		expect(
			rerender({
				current: withLineAfterSummary({ body: first, line: 'A note by hand.' }),
				sent: [first],
			}),
		).toEqual({
			refusal:
				"the change request body holds 1 line above '### For the reviewer' that the render would drop ('A note by hand.'): record it with dialecte lot brief (sections) or in the record it belongs to, move it under '### For the reviewer', or remove it from the body (a line another cli version wrote is removed there); nothing sent",
		})
	})

	it.each([
		['a #### heading', '#### Note'],
		['a bold line', '**Careful here**'],
		['a fenced block', '```\nconst a = 1\n```'],
	])('%s added above the kept heading → refused', (_name, line) => {
		const first = firstBodyOf()

		const result = rerender({ current: withLineAfterSummary({ body: first, line }), sent: [first] })

		expect('refusal' in result ? result.refusal : result.body).toMatch(
			/^the change request body holds \d lines? above/,
		)
	})

	it('four lines added → the first three named and the count', () => {
		const first = firstBodyOf()
		const current = withLineAfterSummary({ body: first, line: 'one\ntwo\nthree\nfour' })

		const result = rerender({ current, sent: [first] })

		expect('refusal' in result ? result.refusal : result.body).toMatch(
			/holds 4 lines above '### For the reviewer' that the render would drop \('one', 'two', 'three'\): record them/,
		)
	})

	it.each([
		['an author box ticked on the host', (body: string) => body.replace('- [ ] ', '- [x] ')],
		['lines a person deleted', (body: string) => body.replace('X lands.\n', '')],
		[
			'a person part edited below the kept heading',
			(body: string) => `${body}\n\nA reviewer note.`,
		],
	])('%s → no refusal, the render sent', (_name, edit) => {
		const first = firstBodyOf()

		const result = rerender({ current: edit(first), sent: [first] })

		expect('refusal' in result ? result.refusal : 'rendered').toBe('rendered')
	})

	it('a summary rewritten and a section removed since the last send → no refusal: the old lines were sent', () => {
		const sectioned = { ...SOURCES, sections: [{ heading: 'Deviations', text: 'One pass kept.' }] }
		const first = firstBodyOf(sectioned)

		const result = rerender({
			current: first,
			sent: [first],
			sources: { ...SOURCES, summary: 'X lands once.' },
		})

		expect('refusal' in result ? result.refusal : result.body).toMatch(
			/^### Summary\n\nX lands once\.\n/,
		)
	})

	it('a hand line recorded as a section → no refusal, the section in the new body', () => {
		const first = firstBodyOf()
		const current = withLineAfterSummary({
			body: first,
			line: '### Removals\n\nNothing outside the lot.',
		})
		const sources = {
			...SOURCES,
			sections: [{ heading: 'Removals', text: 'Nothing outside the lot.' }],
		}

		const result = rerender({ current, sent: [first], sources })

		expect('refusal' in result ? result.refusal : result.body).toMatch(
			/### Removals\n\nNothing outside the lot\.\n\n### For the reviewer/,
		)
	})

	it('a hand line moved under the kept heading → carried in the person part', () => {
		const first = firstBodyOf()

		const result = rerender({ current: `${first}\n\nA note by hand.`, sent: [first] })

		expect('refusal' in result ? result.refusal : result.body).toMatch(
			/- \[ \] The code is reviewed\n\nA note by hand\.$/,
		)
	})

	it('the placeholder body with a record present → no refusal', () => {
		const first = firstBodyOf()

		const result = rerender({
			current: 'Lot 0001-cli-x. The full suite runs on CI; the merge queue lands it.',
			sent: [first],
		})

		expect('refusal' in result ? result.refusal : 'rendered').toBe('rendered')
	})

	it('a body with CRLF line ends and a hand line → refused as with LF', () => {
		const first = firstBodyOf()
		const current = withLineAfterSummary({ body: first, line: 'A note by hand.' }).replace(
			/\n/g,
			'\r\n',
		)

		const result = rerender({ current, sent: [first] })

		expect('refusal' in result ? result.refusal : result.body).toMatch(/\('A note by hand\.'\)/)
	})
})

describe('renderChangeRequest with no record for the change request: the heading fallback', () => {
	it.each([
		['an ATX heading', '### Hand section\n\nIts text.', true],
		['a setext heading', 'Hand section\n============', true],
		['a fence it never closes', '```\nopen', true],
		['a paragraph (not seen: the bounded fallback)', 'A note by hand.', false],
		['a #### heading (deeper than the template parts)', '#### Note', false],
	])('%s above the kept heading', (_name, line, refused: boolean) => {
		const first = firstBodyOf()

		const result = rerender({
			current: withLineAfterSummary({ body: first, line }),
			sent: undefined,
		})

		expect('refusal' in result ? result.refusal : 'rendered').toMatch(
			refused
				? /^the change request body holds \d lines? above '### For the reviewer'/
				: /^rendered$/,
		)
	})

	it('a hand setext heading recorded as a section → no refusal, whatever its style', () => {
		const first = firstBodyOf()
		const current = withLineAfterSummary({
			body: first,
			line: 'Hand section\n============\n\nIts text.',
		})
		const sources = { ...SOURCES, sections: [{ heading: 'Hand Section', text: 'Its text.' }] }

		const result = rerender({ current, sent: undefined, sources })

		expect('refusal' in result ? result.refusal : 'rendered').toBe('rendered')
	})
})
