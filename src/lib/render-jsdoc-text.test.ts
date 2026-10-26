import { renderJsDocText } from './render-jsdoc-text.ts'

import { describe, expect, it } from 'vitest'

import type ts from 'typescript'

/** A link as the compiler hands it (TypeScript 6): opening part, name and label parts, closing part. */
function link(params: { tag?: string; name?: string; label?: string }): ts.SymbolDisplayPart[] {
	return [
		{ kind: 'link', text: `{@${params.tag ?? 'link'} ` },
		...(params.name === undefined ? [] : [{ kind: 'linkName', text: params.name }]),
		...(params.label === undefined ? [] : [{ kind: 'linkText', text: params.label }]),
		{ kind: 'link', text: '}' },
	]
}

describe('renderJsDocText', () => {
	const testCases: Record<string, { parts: ts.SymbolDisplayPart[] | undefined; expected: string }> =
		{
			'no parts → empty': { parts: undefined, expected: '' },
			'plain text → as is': { parts: [{ kind: 'text', text: 'Reads it.' }], expected: 'Reads it.' },
			'unresolved target with a label (one text part) → the label': {
				parts: link({ label: 'Missing.thing the thing' }),
				expected: 'the thing',
			},
			'unresolved target alone → the target as code': {
				parts: link({ label: 'Missing ' }),
				expected: '`Missing`',
			},
			'{@linkplain X | label} → the label': {
				parts: link({ tag: 'linkplain', name: 'getTree', label: 'the tree' }),
				expected: 'the tree',
			},
		}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(renderJsDocText(testCase.parts)).toBe(testCase.expected)
		})
	}
})
