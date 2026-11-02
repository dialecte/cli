import { readMutationDeclaration } from './declaration.ts'

import { describe, expect, it } from 'vitest'

const FAST = { vitestConfig: 'scripts/mutants/vitest.mutation.config.ts' }

function withMutation(mutation: unknown): Record<string, unknown> {
	return { name: 'p', dialecte: { mutation } }
}

describe('readMutationDeclaration', () => {
	it('no dialecte.mutation → none', () => {
		expect(readMutationDeclaration({ packageJson: {} })).toEqual({ kind: 'none' })
		expect(readMutationDeclaration({ packageJson: { dialecte: { gate: {} } } })).toEqual({
			kind: 'none',
		})
	})

	it('a minimal declaration → declared, exclude and errorFactories defaulted to []', () => {
		expect(
			readMutationDeclaration({ packageJson: withMutation({ scope: ['src/**'], fast: FAST }) }),
		).toEqual({
			kind: 'declared',
			declaration: { scope: ['src/**'], exclude: [], errorFactories: [], fast: FAST },
		})
	})

	it('a full declaration → declared as written', () => {
		const mutation = {
			scope: ['src/a/**', 'src/b/**'],
			exclude: ['**/errors/**'],
			errorFactories: ['createSclError'],
			fast: FAST,
			full: { command: 'npx vitest run --project unit --bail=1' },
		}
		expect(readMutationDeclaration({ packageJson: withMutation(mutation) })).toEqual({
			kind: 'declared',
			declaration: mutation,
		})
	})

	it.each([
		['an empty scope', 'scope', { scope: [], fast: FAST }],
		['a non-array scope', 'scope', { scope: 'src/**', fast: FAST }],
		['a non-string scope entry', 'scope', { scope: ['src/**', 3], fast: FAST }],
		['no scope', 'scope', { fast: FAST }],
		['no fast', 'fast.vitestConfig', { scope: ['src/**'] }],
		['a fast without vitestConfig', 'fast.vitestConfig', { scope: ['src/**'], fast: {} }],
		['a full without command', 'full.command', { scope: ['src/**'], fast: FAST, full: {} }],
	])('%s → invalid, the reason names only %s', (_label, field, mutation) => {
		const others = ['scope', 'fast.vitestConfig', 'full.command'].filter(
			(name) => name !== field && !field.startsWith(`${name}.`) && !name.startsWith(`${field}.`),
		)
		expect(readMutationDeclaration({ packageJson: withMutation(mutation) })).toEqual({
			kind: 'invalid',
			reason: expect.stringContaining(field),
		})
		expect(readMutationDeclaration({ packageJson: withMutation(mutation) })).toEqual({
			kind: 'invalid',
			reason: expect.not.stringMatching(
				new RegExp(others.map((name) => name.replace('.', '\\.')).join('|')),
			),
		})
	})

	it.each([
		['braces', 'src/{a,b}/**'],
		['a character class', 'src/[ab]/**'],
		['a negated extglob', 'src/!(a)/**'],
		['an optional extglob', 'src/?(a)/**'],
		['a one-or-more extglob', 'src/+(a)/**'],
		['a zero-or-more extglob', 'src/*(a)/**'],
		['an at extglob', 'src/@(a)/**'],
	])('a scope glob with %s → invalid, naming scope and the glob dialect', (_label, glob) => {
		expect(
			readMutationDeclaration({ packageJson: withMutation({ scope: [glob], fast: FAST }) }),
		).toEqual({
			kind: 'invalid',
			reason: expect.stringMatching(/scope[\s\S]*\*[\s\S]*one segment[\s\S]*\*\*[\s\S]*segments/),
		})
	})

	it('an exclude glob with braces → invalid, naming exclude and the glob dialect', () => {
		expect(
			readMutationDeclaration({
				packageJson: withMutation({ scope: ['src/**'], exclude: ['**/{a,b}.ts'], fast: FAST }),
			}),
		).toEqual({
			kind: 'invalid',
			reason: expect.stringMatching(/exclude[\s\S]*one segment[\s\S]*segments/),
		})
	})

	it('a scope glob with the supported syntax (*, **, ?) → declared', () => {
		expect(
			readMutationDeclaration({
				packageJson: withMutation({ scope: ['src/**/a?.ts', 'src/*.ts'], fast: FAST }),
			}),
		).toMatchObject({ kind: 'declared' })
	})

	it('an unknown key inside fast → invalid, the reason names fast, the key and the known keys', () => {
		expect(
			readMutationDeclaration({
				packageJson: withMutation({ scope: ['src/**'], fast: { ...FAST, vitestConfg: 'x' } }),
			}),
		).toEqual({
			kind: 'invalid',
			reason: expect.stringMatching(/fast[\s\S]*vitestConfg[\s\S]*vitestConfig/),
		})
	})

	it('an unknown key inside full → invalid, the reason names full, the key and the known keys', () => {
		expect(
			readMutationDeclaration({
				packageJson: withMutation({
					scope: ['src/**'],
					fast: FAST,
					full: { command: 'x', comand: 'y' },
				}),
			}),
		).toEqual({
			kind: 'invalid',
			reason: expect.stringMatching(/full[\s\S]*comand[\s\S]*command/),
		})
	})

	it('an unknown key → invalid, the reason names the key and the known keys', () => {
		expect(
			readMutationDeclaration({
				packageJson: withMutation({ scope: ['src/**'], fast: FAST, scopes: ['x'] }),
			}),
		).toEqual({
			kind: 'invalid',
			reason: expect.stringMatching(
				/scopes[\s\S]*scope[\s\S]*exclude[\s\S]*errorFactories[\s\S]*fast[\s\S]*full/,
			),
		})
	})
})
