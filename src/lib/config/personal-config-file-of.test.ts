/** Where the personal config.yml lives on each platform (D8): exact strings, the platform passed in. */
import { personalConfigFileOf } from './personal-config-file-of.ts'

import { describe, expect, it } from 'vitest'

type Case = {
	name: string
	platform: NodeJS.Platform
	home: string
	environment: Record<string, string | undefined>
	expected: string
}

const CASES: Case[] = [
	{
		name: 'linux, no XDG',
		platform: 'linux',
		home: '/home/person-a',
		environment: {},
		expected: '/home/person-a/.config/dialecte/config.yml',
	},
	{
		name: 'linux, XDG set',
		platform: 'linux',
		home: '/home/person-a',
		environment: { XDG_CONFIG_HOME: '/xdg' },
		expected: '/xdg/dialecte/config.yml',
	},
	{
		name: 'linux, XDG empty is ignored',
		platform: 'linux',
		home: '/home/person-a',
		environment: { XDG_CONFIG_HOME: '' },
		expected: '/home/person-a/.config/dialecte/config.yml',
	},
	{
		name: 'macOS, no XDG',
		platform: 'darwin',
		home: '/Users/person-a',
		environment: {},
		expected: '/Users/person-a/.config/dialecte/config.yml',
	},
	{
		name: 'macOS, XDG set',
		platform: 'darwin',
		home: '/Users/person-a',
		environment: { XDG_CONFIG_HOME: '/xdg' },
		expected: '/xdg/dialecte/config.yml',
	},
	{
		name: 'macOS, XDG empty is ignored',
		platform: 'darwin',
		home: '/Users/person-a',
		environment: { XDG_CONFIG_HOME: '' },
		expected: '/Users/person-a/.config/dialecte/config.yml',
	},
	{
		name: 'windows, APPDATA',
		platform: 'win32',
		home: 'C:\\Users\\person-a',
		environment: { APPDATA: 'C:\\Users\\person-a\\AppData\\Roaming' },
		expected: 'C:\\Users\\person-a\\AppData\\Roaming\\dialecte\\config.yml',
	},
	{
		name: 'windows, XDG set wins over APPDATA',
		platform: 'win32',
		home: 'C:\\Users\\person-a',
		environment: { XDG_CONFIG_HOME: 'D:\\xdg', APPDATA: 'C:\\Users\\person-a\\AppData\\Roaming' },
		expected: 'D:\\xdg\\dialecte\\config.yml',
	},
	{
		name: 'windows, XDG empty is ignored for APPDATA',
		platform: 'win32',
		home: 'C:\\Users\\person-a',
		environment: { XDG_CONFIG_HOME: '', APPDATA: 'C:\\Users\\person-a\\AppData\\Roaming' },
		expected: 'C:\\Users\\person-a\\AppData\\Roaming\\dialecte\\config.yml',
	},
	{
		name: 'windows, neither APPDATA nor XDG',
		platform: 'win32',
		home: 'C:\\Users\\person-a',
		environment: {},
		expected: 'C:\\Users\\person-a\\AppData\\Roaming\\dialecte\\config.yml',
	},
]

describe('personalConfigFileOf', () => {
	it.each(CASES)('$name', ({ platform, home, environment, expected }) => {
		expect(personalConfigFileOf({ environment, platform, home })).toBe(expected)
	})
})
