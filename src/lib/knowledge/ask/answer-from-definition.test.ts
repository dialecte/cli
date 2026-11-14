import { resolvedContext } from '../../../../test/ask-fixtures.ts'
import {
	FIRST_DECLARATION_DOCUMENTATION,
	FIRST_DECLARATION_TYPE_NAME,
	SECOND_DECLARATION_DOCUMENTATION,
	SECOND_DECLARATION_ENUMERATION,
} from '../../../../test/multi-declared-dialecte.constants.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { definitionHash } from '../../schema/definition-hash.ts'
import { answerFromDefinition } from './answer-from-definition.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { AnswerFromDefinitionParams, AskKind, KindSlots } from './ask.types.ts'

const VERSION = '1.2.3'
const DEFAULT_NAMESPACE = 'http://dialecte.dev/XML/DEFAULT'
const SENTENCE = expect.stringMatching(/\S/)

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

type RungRow = {
	kind: AskKind
	slots: KindSlots
	/** The tag and parent of the resolved context. */
	tag: string
	parent?: string
	declarations: number
	verdict: string
	value: string | null
}

function paramsOf(row: Omit<RungRow, 'verdict' | 'value'>): AnswerFromDefinitionParams {
	return {
		dialecte,
		version: VERSION,
		kind: row.kind,
		slots: row.slots,
		context: resolvedContext({
			packageName: dialecte.packageName,
			tag: row.tag,
			parent: row.parent ?? null,
			declarations: row.declarations,
		}),
	}
}

describe('answerFromDefinition: one kind per row, on a tag declared once and on AAA_1 (D6, case 10)', () => {
	const rows: Record<string, RungRow> = {
		'children of AA_1': {
			kind: 'children',
			slots: { tag: 'AA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'value',
			value: 'AAA_1, AAA_2, AAA_3',
		},
		'6 children of AAA_1 under AA_1: declaration 1': {
			kind: 'children',
			slots: { tag: 'AAA_1', parent: 'AA_1' },
			tag: 'AAA_1',
			parent: 'AA_1',
			declarations: 2,
			verdict: 'value',
			value: 'AAAA_1',
		},
		'children of AAA_1 under AA_2: declaration 2': {
			kind: 'children',
			slots: { tag: 'AAA_1', parent: 'AA_2' },
			tag: 'AAA_1',
			parent: 'AA_2',
			declarations: 2,
			verdict: 'value',
			value: 'AAAA_2',
		},
		'parents of AA_1': {
			kind: 'parents',
			slots: { tag: 'AA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'value',
			value: 'A',
		},
		'parents of AAA_1 under AA_1: the parents holding declaration 1': {
			kind: 'parents',
			slots: { tag: 'AAA_1', parent: 'AA_1' },
			tag: 'AAA_1',
			parent: 'AA_1',
			declarations: 2,
			verdict: 'value',
			value: 'AA_1, AA_3, AA_4',
		},
		'required attributes of AA_1': {
			kind: 'required',
			slots: { tag: 'AA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'value',
			value: 'aAA_1',
		},
		'required attributes of AAA_1 under AA_2: none': {
			kind: 'required',
			slots: { tag: 'AAA_1', parent: 'AA_2' },
			tag: 'AAA_1',
			parent: 'AA_2',
			declarations: 2,
			verdict: 'value',
			value: '',
		},
		'is aAA_1 required on AA_1: yes': {
			kind: 'required',
			slots: { tag: 'AA_1', attribute: 'aAA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'yes',
			value: 'aAA_1',
		},
		'is bAA_1 required on AA_1: no': {
			kind: 'required',
			slots: { tag: 'AA_1', attribute: 'bAA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'no',
			value: 'bAA_1',
		},
		'values of bA on A': {
			kind: 'values',
			slots: { tag: 'A', attribute: 'bA' },
			tag: 'A',
			declarations: 1,
			verdict: 'value',
			value: 'x, y, z',
		},
		'values of bAAA_1 on AAA_1 under AA_2': {
			kind: 'values',
			slots: { tag: 'AAA_1', parent: 'AA_2', attribute: 'bAAA_1' },
			tag: 'AAA_1',
			parent: 'AA_2',
			declarations: 2,
			verdict: 'value',
			value: SECOND_DECLARATION_ENUMERATION.join(', '),
		},
		'values of an attribute with no enumeration: none': {
			kind: 'values',
			slots: { tag: 'AA_1', attribute: 'bAA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'value',
			value: '',
		},
		'default of bA on A: none': {
			kind: 'default',
			slots: { tag: 'A', attribute: 'bA' },
			tag: 'A',
			declarations: 1,
			verdict: 'value',
			value: null,
		},
		'fixed value of bA on A: none': {
			kind: 'fixed',
			slots: { tag: 'A', attribute: 'bA' },
			tag: 'A',
			declarations: 1,
			verdict: 'value',
			value: null,
		},
		'default of bBBB_1 on BBB_1: false': {
			kind: 'default',
			slots: { tag: 'BBB_1', attribute: 'bBBB_1' },
			tag: 'BBB_1',
			declarations: 1,
			verdict: 'value',
			value: 'false',
		},
		'default of bBB_1 on BB_1: the empty string, not none': {
			kind: 'default',
			slots: { tag: 'BB_1', attribute: 'bBB_1' },
			tag: 'BB_1',
			declarations: 1,
			verdict: 'value',
			value: '',
		},
		'fixed value of aCC_1 on CC_1': {
			kind: 'fixed',
			slots: { tag: 'CC_1', attribute: 'aCC_1' },
			tag: 'CC_1',
			declarations: 1,
			verdict: 'value',
			value: 'fixed_val',
		},
		'type of bA on A: the attribute type': {
			kind: 'type',
			slots: { tag: 'A', attribute: 'bA' },
			tag: 'A',
			declarations: 1,
			verdict: 'value',
			value: 'string',
		},
		'type of DD_1: the Clark name': {
			kind: 'type',
			slots: { tag: 'DD_1' },
			tag: 'DD_1',
			declarations: 1,
			verdict: 'value',
			value: `{${DEFAULT_NAMESPACE}}tDD_1`,
		},
		'type of AAA_1 under AA_1: the first declaration type': {
			kind: 'type',
			slots: { tag: 'AAA_1', parent: 'AA_1' },
			tag: 'AAA_1',
			parent: 'AA_1',
			declarations: 2,
			verdict: 'value',
			value: `{${DEFAULT_NAMESPACE}}${FIRST_DECLARATION_TYPE_NAME}`,
		},
		'type of AA_1: anonymous, none': {
			kind: 'type',
			slots: { tag: 'AA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'value',
			value: null,
		},
		'variants of DD_1': {
			kind: 'variants',
			slots: { tag: 'DD_1' },
			tag: 'DD_1',
			declarations: 1,
			verdict: 'value',
			value: [
				`{${DEFAULT_NAMESPACE}}tDD_1A`,
				`{${DEFAULT_NAMESPACE}}tDD_1B`,
				'{http://dialecte.dev/XML/DEV-EXT}tDD_1A',
				'{http://dialecte.dev/XML/DEV-EXT}tDD_1C',
			].join(', '),
		},
		'variants of AA_1: none': {
			kind: 'variants',
			slots: { tag: 'AA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'value',
			value: '',
		},
		'documentation of AAA_1 under AA_1': {
			kind: 'documentation',
			slots: { tag: 'AAA_1', parent: 'AA_1' },
			tag: 'AAA_1',
			parent: 'AA_1',
			declarations: 2,
			verdict: 'value',
			value: FIRST_DECLARATION_DOCUMENTATION,
		},
		'documentation of AAA_1 under AA_2': {
			kind: 'documentation',
			slots: { tag: 'AAA_1', parent: 'AA_2' },
			tag: 'AAA_1',
			parent: 'AA_2',
			declarations: 2,
			verdict: 'value',
			value: SECOND_DECLARATION_DOCUMENTATION,
		},
		'documentation of AA_1: none': {
			kind: 'documentation',
			slots: { tag: 'AA_1' },
			tag: 'AA_1',
			declarations: 1,
			verdict: 'value',
			value: null,
		},
	}
	it.each(Object.entries(rows))('%s', (_name, row) => {
		expect(answerFromDefinition(paramsOf(row))).toEqual({
			answer: { verdict: row.verdict, value: row.value, text: SENTENCE },
			sources: [
				{
					kind: 'schema',
					package: dialecte.packageName,
					version: VERSION,
					definitionHash: definitionHash({ config: dialecte.config }),
				},
			],
		})
	})
})

describe('answerFromDefinition: what the rung leaves or refuses', () => {
	it('an attribute the element lacks: refused, naming the element attributes', () => {
		expect(
			answerFromDefinition(
				paramsOf({
					kind: 'required',
					slots: { tag: 'AA_1', attribute: 'zAA_1' },
					tag: 'AA_1',
					declarations: 1,
				}),
			),
		).toEqual({ refused: expect.stringMatching(/(?=.*aAA_1)(?=.*bAA_1)(?=.*zAA_1)/s) })
	})

	it.each(['required', 'values', 'default', 'fixed'] as const)(
		'%s of an attribute the element lacks: refused, naming the element attributes',
		(kind) => {
			expect(
				answerFromDefinition(
					paramsOf({
						kind,
						slots: { tag: 'AA_1', attribute: 'zAA_1' },
						tag: 'AA_1',
						declarations: 1,
					}),
				),
			).toEqual({ refused: expect.stringMatching(/(?=.*aAA_1)(?=.*bAA_1)(?=.*zAA_1)/s) })
		},
	)

	it.each(['semantic', 'code', 'method'] as const)('kind %s: the rung does not answer', (kind) => {
		expect(
			answerFromDefinition(
				paramsOf({
					kind,
					slots: { tag: 'AA_1' },
					tag: 'AA_1',
					declarations: 1,
				}),
			),
		).toBeUndefined()
	})

	it('an unresolved context: the rung does not answer', () => {
		expect(
			answerFromDefinition({
				dialecte,
				version: VERSION,
				kind: 'children',
				slots: { tag: 'AAA_1' },
				context: {
					package: dialecte.packageName,
					tags: [
						{
							tag: 'AAA_1',
							parent: null,
							declarations: 2,
							resolved: false,
							packages: [dialecte.packageName],
						},
					],
					resolved: false,
					decision: true,
				},
			}),
		).toBeUndefined()
	})
})
