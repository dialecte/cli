import { isActFinding, positionsOf, preparedOf } from '../../../test/fixture-rules-cases.ts'
import { checkCodeRules } from './check-code-rules.ts'

import { describe, expect, it } from 'vitest'

import type { FindingsCase } from '../../../test/fixture-rules-cases.types.ts'

describe('transaction-spy: a spy on how the code writes', () => {
	const testCases: Record<string, FindingsCase> = {
		'a spy on a transaction method → flagged': {
			body: [
				"it('adds the widget', async () => {",
				"\tconst spy = vi.spyOn(tx, 'addChild') // flag transaction-spy",
				'\texpect(spy).toBeDefined()',
				'})',
			],
		},
		'a spy on a query reached through a context → flagged': {
			body: [
				"it('reads the widget', async () => {",
				"\tvi.spyOn(context.query, 'getRecord') // flag transaction-spy",
				'})',
			],
		},
		'a jest spy on a transaction → flagged': {
			body: [
				"it('updates the widget', async () => {",
				"\tjest.spyOn(transaction, 'update') // flag transaction-spy",
				'})',
			],
		},
		'a spyOn imported from vitest on a query named *Query → flagged': {
			body: [
				"import { spyOn } from 'vitest'",
				"it('reads the widget', async () => {",
				"\tspyOn(widgetQuery, 'getRecord') // flag transaction-spy",
				'})',
			],
		},
		'two spies on a query binding in one test → one finding each, on its own line': {
			body: [
				"it('reads and writes', async () => {",
				"\tvi.spyOn(tx, 'addChild') // flag transaction-spy",
				'\tconst value = 1',
				"\tvi.spyOn(tx, 'remove') // flag transaction-spy",
				'\texpect(value).toBe(1)',
				'})',
			],
		},
		'a spy on the console → none': {
			body: ["it('warns', () => {", "\tvi.spyOn(console, 'warn')", '})'],
		},
		'a spy on Date.now → none': {
			body: ["it('reads the clock', () => {", "\tvi.spyOn(Date, 'now')", '})'],
		},
		'a spy on a service that is not a query binding → none': {
			body: ["it('notifies', () => {", "\tvi.spyOn(widgetService, 'notify')", '})'],
		},
		'a spyOn imported from another module on a transaction → none': {
			body: [
				"import { spyOn } from './spies.ts'",
				"it('adds the widget', async () => {",
				"\tspyOn(tx, 'addChild')",
				'})',
			],
		},
		'a spyOn declared in the module on a transaction → none': {
			body: [
				'function spyOn(target: unknown, method: string) {',
				'\treturn [target, method]',
				'}',
				"it('adds the widget', async () => {",
				"\tspyOn(tx, 'addChild')",
				'})',
			],
		},
		'a spy on a transaction in a module that is not a Dialecte change → none': {
			testRules: false,
			body: ["it('adds the widget', async () => {", "\tvi.spyOn(tx, 'addChild')", '})'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isActFinding))).toEqual(expected)
		})
})

describe('transaction-spy: message', () => {
	const messageCases: Record<string, { body: string[]; messages: string[] }> = {
		'the message names the target path and the method of a transaction spy': {
			body: ["it('adds', () => {", "\tvi.spyOn(tx, 'addChild')", '})'],
			messages: [
				'a spy on tx.addChild tests how the code writes: assert the outcome (error key, staged operations, documents)',
			],
		},
		'the message joins a longer target path to the method': {
			body: ["it('reads', () => {", "\tvi.spyOn(context.query, 'getRecord')", '})'],
			messages: [
				'a spy on context.query.getRecord tests how the code writes: assert the outcome (error key, staged operations, documents)',
			],
		},
		'the message of a jest spy names its target the same way': {
			body: ["it('updates', () => {", "\tjest.spyOn(transaction, 'update')", '})'],
			messages: [
				'a spy on transaction.update tests how the code writes: assert the outcome (error key, staged operations, documents)',
			],
		},
	}

	for (const [title, { body, messages }] of Object.entries(messageCases))
		it(title, () => {
			const { params } = preparedOf({ body })
			expect(
				checkCodeRules(params)
					.filter((finding) => finding.rule === 'transaction-spy')
					.map((finding) => ({ message: finding.message, severity: finding.severity })),
			).toEqual(messages.map((message) => ({ message, severity: 'error' })))
		})
})
