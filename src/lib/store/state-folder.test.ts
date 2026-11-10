import { join } from 'node:path'

import { stateFolder } from './state-folder.ts'
import { storeListPath } from './store-list.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('stateFolder', () => {
	it('XDG_STATE_HOME set → that folder, whatever the home', () => {
		expect(
			stateFolder({ environment: { XDG_STATE_HOME: '/state/x' }, home: '/home/person-a' }),
		).toBe('/state/x')
	})

	it('XDG_STATE_HOME unset → <home>/.local/state', () => {
		expect(stateFolder({ environment: {}, home: '/home/person-a' })).toBe(
			join('/home/person-a', '.local', 'state'),
		)
	})

	it('XDG_STATE_HOME empty → unset: <home>/.local/state', () => {
		expect(stateFolder({ environment: { XDG_STATE_HOME: '' }, home: '/home/person-a' })).toBe(
			join('/home/person-a', '.local', 'state'),
		)
	})

	it('no parameter → the process environment', () => {
		vi.stubEnv('XDG_STATE_HOME', '/state/y')

		expect(stateFolder()).toBe('/state/y')
	})
})

describe('storeListPath on the shared state folder', () => {
	it('a guard: the store list stays <state>/dialecte/lot-stores', () => {
		expect(storeListPath({ environment: { XDG_STATE_HOME: '/state/x' } })).toBe(
			join('/state/x', 'dialecte', 'lot-stores'),
		)
	})
})
