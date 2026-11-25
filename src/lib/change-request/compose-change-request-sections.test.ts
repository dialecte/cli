/**
 * A lot's reviewer sections (the brief's `sections`) render on every render of its change request: at the template's
 * `reviewer-sections` marker, else just before the kept part, each under a heading at the level of the template heading
 * above. A section that would clash with the template or the kept part is refused, nothing sent.
 */
import { GENERIC_NOUNS } from '../host/host.constants.ts'
import { composeChangeRequest, templateFaultOf } from './compose-change-request.ts'

import { describe, expect, it } from 'vitest'

import type { ChangeRequestSources } from './change-request.types.ts'

const PARTS_AFTER_SUMMARY = `### Behaviours

<!-- dialecte:behaviours -->

### Changelog

<!-- dialecte:changelog -->

### Tests

<!-- dialecte:tests -->

### Review

<!-- dialecte:review -->

### Risk and effort

<!-- dialecte:risk -->

### Overlaps

<!-- dialecte:overlaps -->

### Depends on

<!-- dialecte:depends -->

### Issue

<!-- dialecte:issue -->

### Checklist

<!-- dialecte:checklist -->

<!-- dialecte:kept -->
### For the reviewer

- [ ] The code is reviewed
`

/** A template without the sections marker. */
const PLAIN = `### Summary

<!-- dialecte:summary -->

${PARTS_AFTER_SUMMARY}`

/** The same template marking the sections after the summary. */
const MARKED = `### Summary

<!-- dialecte:summary -->

<!-- dialecte:reviewer-sections -->

${PARTS_AFTER_SUMMARY}`

const DEVIATIONS = {
	heading: 'Deviations from the design',
	text: 'One pass kept.\n\n- the reader stays',
}
const REMOVALS = { heading: 'Removals this fix refuses', text: 'Nothing outside the lot.' }

/** A lot with a summary and these sections. */
function sourcesWith(sections: ChangeRequestSources['sections']): ChangeRequestSources {
	return {
		messages: ['fix(x): x'],
		summary: 'X lands.',
		treeHash: 'a'.repeat(64),
		release: false,
		...(sections !== undefined && { sections }),
	}
}

/** The body of the lot over `template`, or its refusal. */
function render(params: { template: string; sections?: ChangeRequestSources['sections'] }) {
	const text = composeChangeRequest({
		template: params.template,
		sources: sourcesWith(params.sections),
		nouns: GENERIC_NOUNS,
		kept: undefined,
	})
	return 'refusal' in text ? text : text.body
}

describe('composeChangeRequest renders the reviewer sections', () => {
	it('a template marking the sections → each there, under a heading at the level of the heading above, in order', () => {
		const body = render({ template: MARKED, sections: [DEVIATIONS, REMOVALS] })

		expect(typeof body === 'string' ? body.split('\n### Behaviours')[0] : body).toBe(
			[
				'### Summary',
				'',
				'X lands.',
				'',
				'### Deviations from the design',
				'',
				'One pass kept.',
				'',
				'- the reader stays',
				'',
				'### Removals this fix refuses',
				'',
				'Nothing outside the lot.',
				'',
			].join('\n'),
		)
	})

	it('a template whose heading above the marker is ## → the sections under ## headings', () => {
		const body = render({
			template: MARKED.replace('### Summary', '## Summary'),
			sections: [REMOVALS],
		})

		expect(
			typeof body === 'string' && body.includes('\n## Removals this fix refuses\n\nNothing'),
		).toBe(true)
	})

	it('a template without the marker → the sections just before the kept part', () => {
		const body = render({ template: PLAIN, sections: [REMOVALS] })

		expect(typeof body === 'string' ? body.split('### Checklist\n')[1] : body).toMatch(
			/\n\n### Removals this fix refuses\n\nNothing outside the lot\.\n\n### For the reviewer\n/,
		)
	})

	it('no sections over the marked template → the body of the template without the marker and its blank line', () => {
		expect(render({ template: MARKED })).toEqual(render({ template: PLAIN }))
	})

	it.each([
		[
			'a heading repeating a heading of the template',
			[{ heading: 'summary', text: 'x' }],
			"brief.json sections[0].heading repeats the heading 'Summary' of the change request template: rename it with dialecte lot brief, nothing sent",
		],
		[
			'a heading repeating the kept heading',
			[REMOVALS, { heading: 'For the  Reviewer', text: 'x' }],
			"brief.json sections[1].heading repeats the heading 'For the reviewer' of the change request template: rename it with dialecte lot brief, nothing sent",
		],
		[
			'a text holding the kept heading as a line',
			[{ heading: 'Notes', text: 'one\n### For the reviewer\ntwo' }],
			"brief.json sections[0].text holds the line '### For the reviewer' the kept part starts at: reword it with dialecte lot brief, nothing sent",
		],
	])('%s → refused naming the section, nothing rendered', (_name, sections, refusal) => {
		expect(render({ template: MARKED, sections })).toEqual({ refusal })
	})
})

describe('templateFaultOf reads the sections marker', () => {
	it.each([
		[
			'the marker twice',
			MARKED.replace('### Behaviours', '<!-- dialecte:reviewer-sections -->\n\n### Behaviours'),
			'marker reviewer-sections twice',
		],
		[
			'the marker after kept',
			`${PLAIN}\n<!-- dialecte:reviewer-sections -->\n`,
			'marker reviewer-sections after kept',
		],
		[
			'a marker naming no part',
			MARKED.replace('reviewer-sections', 'reviewer-section'),
			'marker reviewer-section names no part',
		],
	])('%s → its fault', (_name, template, fault) => {
		expect(templateFaultOf(template)).toBe(fault)
	})
})
