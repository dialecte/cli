import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readPackageJson } from '../package-json.ts'
import { readProfile } from './profile.ts'

import { describe, expect, it } from 'vitest'

/** A folder whose package.json holds `packageJson`. */
function packageWith(packageJson: Record<string, unknown>): string {
	const root = temporaryFolder('dialecte-profile-')
	writeFileSync(join(root, 'package.json'), JSON.stringify(packageJson))
	return root
}

const BOTH_PROFILES = 'is not a profile; profiles: contributor, consumer'

describe('readProfile', () => {
	it('no dialecte field → consumer', () => {
		expect(readProfile(packageWith({ name: 'app' }))).toBe('consumer')
	})

	it('dialecte without profile → consumer', () => {
		expect(readProfile(packageWith({ name: 'app', dialecte: { baseBranch: 'main' } }))).toBe(
			'consumer',
		)
	})

	it('"contributor" → contributor', () => {
		expect(readProfile(packageWith({ dialecte: { profile: 'contributor' } }))).toBe('contributor')
	})

	it('"consumer" → consumer', () => {
		expect(readProfile(packageWith({ dialecte: { profile: 'consumer' } }))).toBe('consumer')
	})

	it('"Contributor" → throws naming the value and both profiles', () => {
		expect(() => readProfile(packageWith({ dialecte: { profile: 'Contributor' } }))).toThrow(
			`dialecte.profile: "Contributor" ${BOTH_PROFILES}`,
		)
	})

	it('a number → throws naming the value and both profiles', () => {
		expect(() => readProfile(packageWith({ dialecte: { profile: 3 } }))).toThrow(
			new RegExp(`dialecte\\.profile: .*3.* ${BOTH_PROFILES}`),
		)
	})
})

describe('the cli’s own package.json', () => {
	const CLI_ROOT = resolve(import.meta.dirname, '..', '..', '..')

	it('readProfile of the cli’s own root → contributor', () => {
		expect(readProfile(CLI_ROOT)).toBe('contributor')
	})

	it('dialecte.contrib.steps is empty and dialecte.tdd is kept', () => {
		expect(readPackageJson(CLI_ROOT).dialecte).toMatchObject({
			contrib: { steps: [] },
			tdd: { production: ['test/suite-guard'] },
		})
	})
})
