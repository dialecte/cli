/**
 * `lot moved <from> <to>`: a case of the lot proven red, then moved by a split or a rename, keeps its red under its new
 * label when its test call is the one the red froze; the next green proves it again.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { TDD_LEGEND_TERMS } from '../lib/legend/legend.constants.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-17T12:00:00.000Z')
const STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
const DONE =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'

/** A test file of one case in `describe(title)`, its assertion `assertion`. */
function testText(params: { title: string; assertion?: string }): string {
	return [
		"import { add } from './add.ts'",
		"import { describe, expect, it } from 'vitest'",
		`describe('${params.title}', () => {`,
		`\tit('one plus two → three', () => { ${params.assertion ?? 'expect(add(1, 2)).toBe(3)'} })`,
		'})',
		'',
	].join('\n')
}

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

/** A package whose `src/a.test.ts` case was proven red then green, then moved to `src/b.test.ts` as `moved` says. */
async function movedPackage(params: {
	moved: unknown
	title?: string
	assertion?: string
}): Promise<string> {
	const root = createVitestPackage({
		dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
	})
	writeFiles({ root, files: { 'src/add.ts': STUB, 'src/a.test.ts': testText({ title: 'add' }) } })
	await tdd({ cwd: root, argv: ['red'] })
	writeFileSync(join(root, 'src/add.ts'), DONE)
	await tdd({ cwd: root, argv: ['green'] })
	rmSync(join(root, 'src/a.test.ts'))
	writeFiles({
		root,
		files: {
			'src/b.test.ts': testText({ title: params.title ?? 'add', assertion: params.assertion }),
			'.dialecte/lot.json': JSON.stringify({ moved: params.moved }),
		},
	})
	return root
}

describe('a case of the lot moved after its red', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it.each([
		{
			form: 'the file form',
			moved: [{ from: 'src/a.test.ts', to: 'src/b.test.ts' }],
			title: 'add',
		},
		{
			form: 'the case form, its describe renamed',
			moved: [
				{
					from: 'src/a.test.ts::add > one plus two → three',
					to: 'src/b.test.ts::sum > one plus two → three',
				},
			],
			title: 'sum',
		},
	])(
		'$form, its test call unchanged → red carries the red under the new label; green proves it; the gate passes',
		async ({ moved, title }) => {
			const root = await movedPackage({ moved, title })

			const red = await tdd({ cwd: root, argv: ['red'] })
			const green = await tdd({ cwd: root, argv: ['green'] })
			const result = await runGate({ cwd: root, argv: ['--declare', 'src/'] })

			expect(red.output.split('\n').at(-1)).toMatch(/^tdd red: 1 red, /)
			expect(green.exitCode).toBe(0)
			expect(result.output.split('\n')[1]).toBe(
				'ok    tdd  1 case(s) of the change: 1 red then green',
			)
		},
	)

	it('its test call edited in the move → refused: the call differs from the one its red froze', async () => {
		const root = await movedPackage({
			moved: [{ from: 'src/a.test.ts', to: 'src/b.test.ts' }],
			assertion: 'expect(add(1, 2)).toBe(3); expect(add(0, 0)).toBe(0)',
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(
				/^refused {2}src\/b\.test\.ts::add > one plus two → three {2}moved from src\/a\.test\.ts::add > one plus two → three, but its test call differs from the one that red froze/,
			),
		)
	})

	it('moved from a case with no red receipt → refused: nothing to carry', async () => {
		const root = await movedPackage({
			moved: [
				{
					from: 'src/c.test.ts::add > one plus two → three',
					to: 'src/b.test.ts::add > one plus two → three',
				},
			],
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(
				/^refused {2}src\/b\.test\.ts::add > one plus two → three {2}moved from src\/c\.test\.ts::add > one plus two → three, which holds no red receipt/,
			),
		)
	})

	it('the file form into a file holding its own base case and a new passing case → the moved case carried, the base case unchanged, the new one judged as any new case', async () => {
		const root = createVitestPackage({
			dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
			files: { 'src/add.ts': DONE, 'src/b.test.ts': testText({ title: 'base' }) },
		})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/a.test.ts': testText({ title: 'add' }) } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), DONE)
		await tdd({ cwd: root, argv: ['green'] })
		rmSync(join(root, 'src/a.test.ts'))
		writeFiles({
			root,
			files: {
				'src/b.test.ts': [
					testText({ title: 'base' }),
					"describe('add', () => { it('one plus two → three', () => { expect(add(1, 2)).toBe(3) }) })",
					"describe('new', () => { it('two plus two → four', () => { expect(add(2, 2)).toBe(4) }) })",
					'',
				].join('\n'),
				'.dialecte/lot.json': JSON.stringify({
					moved: [{ from: 'src/a.test.ts', to: 'src/b.test.ts' }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		const lines = red.output.split('\n')

		expect({
			moved: lines.some((line) =>
				/^red {6}src\/b\.test\.ts::add > one plus two → three {2}moved from/.test(line),
			),
			base: lines.some((line) =>
				line.startsWith('unchanged  src/b.test.ts::base > one plus two → three'),
			),
			fresh: lines.some((line) =>
				/^refused {2}src\/b\.test\.ts::new > two plus two → four {2}it ran green/.test(line),
			),
		}).toEqual({ moved: true, base: true, fresh: true })
	})

	it('two files merged into one, two moved entries to it → both cases carry their red', async () => {
		const root = createVitestPackage({
			dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
		})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'src/a.test.ts': testText({ title: 'a' }),
				'src/b.test.ts': testText({ title: 'b' }),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), DONE)
		await tdd({ cwd: root, argv: ['green'] })
		rmSync(join(root, 'src/a.test.ts'))
		rmSync(join(root, 'src/b.test.ts'))
		writeFiles({
			root,
			files: {
				'src/c.test.ts': [
					testText({ title: 'a' }),
					"describe('b', () => { it('one plus two → three', () => { expect(add(1, 2)).toBe(3) }) })",
					'',
				].join('\n'),
				'.dialecte/lot.json': JSON.stringify({
					moved: [
						{ from: 'src/a.test.ts', to: 'src/c.test.ts' },
						{ from: 'src/b.test.ts', to: 'src/c.test.ts' },
					],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n').at(-1)).toMatch(/^tdd red: 2 red, /)
	})

	it('the case form, its own title renamed → refused: the title is part of the test call that red froze', async () => {
		const root = await movedPackage({
			moved: [
				{
					from: 'src/a.test.ts::add > one plus two → three',
					to: 'src/b.test.ts::add > one and two → three',
				},
			],
		})
		writeFileSync(
			join(root, 'src/b.test.ts'),
			testText({ title: 'add' }).replace('one plus two → three', 'one and two → three'),
		)

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(
				/^refused {2}src\/b\.test\.ts::add > one and two → three {2}moved from .*differs/,
			),
		)
	})

	it('the tdd legend → a moved term with a meaning and a look line', () => {
		const term = TDD_LEGEND_TERMS.find((entry) => entry.term === 'moved')

		expect(term).toEqual({
			term: 'moved',
			meaning: expect.stringMatching(/\S/),
			look: expect.stringMatching(/^look/),
		})
	})
})
