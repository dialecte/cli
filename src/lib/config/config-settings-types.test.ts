/** The settings types restate nothing: their keys are the registry's keys of the layer, their nested shapes are those of `DialecteField` (checked by tsc). */
import { describe, expect, it } from 'vitest'

import type { DialecteField } from '../package-json.types.ts'
import type { CONFIG_KEYS } from './config-keys.constants.ts'
import type { PersonalSettings, ProjectSettings } from './config.types.ts'

/** `true` when `Left` and `Right` are the same type. */
type Equal<Left, Right> =
	(<Probe>() => Probe extends Left ? 1 : 2) extends <Probe>() => Probe extends Right ? 1 : 2
		? true
		: false

/** The keys the registry declares for `Layer`. */
type RegistryKeysOf<Layer extends 'project' | 'personal'> = Extract<
	(typeof CONFIG_KEYS)[number],
	{ layer: Layer }
>['key']

/** Compiles only when `Check` is `true`; a no-op at run time. */
function assertTrue<Check extends true>(): Check | undefined {
	return undefined
}

describe('the settings types', () => {
	it('the keys of each type are the registry keys of its layer', () => {
		assertTrue<Equal<keyof ProjectSettings, RegistryKeysOf<'project'>>>()
		assertTrue<Equal<keyof PersonalSettings, RegistryKeysOf<'personal'>>>()

		expect(true).toBe(true)
	})

	it('the nested shapes of the project settings are the ones of DialecteField', () => {
		assertTrue<Equal<ProjectSettings['gate'], DialecteField['gate']>>()
		assertTrue<Equal<ProjectSettings['contrib'], DialecteField['contrib']>>()
		assertTrue<Equal<ProjectSettings['tdd'], DialecteField['tdd']>>()
		assertTrue<Equal<ProjectSettings['risk'], DialecteField['risk']>>()
		assertTrue<Equal<ProjectSettings['generatedDocs'], DialecteField['generatedDocs']>>()
		assertTrue<Equal<ProjectSettings['rebuiltIgnored'], DialecteField['rebuiltIgnored']>>()
		assertTrue<Equal<ProjectSettings['baseBranch'], DialecteField['baseBranch']>>()
		assertTrue<Equal<ProjectSettings['profile'], DialecteField['profile']>>()

		expect(true).toBe(true)
	})

	it('a key list that differs from the registry fails the check', () => {
		// @ts-expect-error a key the registry does not declare for the layer
		assertTrue<Equal<keyof ProjectSettings | 'unknownKey', RegistryKeysOf<'project'>>>()
		// @ts-expect-error a registry key the type leaves out
		assertTrue<Equal<Exclude<keyof ProjectSettings, 'gate'>, RegistryKeysOf<'project'>>>()

		expect(true).toBe(true)
	})
})
