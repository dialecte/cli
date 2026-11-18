/** The key of a repository: its normalized origin, else its real path (lower-cased on win32 and darwin). */
import { mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { WORKSPACE_REPO_KEY } from '../../../test/config-workspace.constants.ts'
import { createConfigWorkspace } from '../../../test/config-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { normalizeRepoKey, repoKeyOf } from './repo-key-of.ts'

import { describe, expect, it } from 'vitest'

describe('repoKeyOf', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an origin in ssh form → its normalized remote', () => {
		const { root } = createConfigWorkspace()

		expect(repoKeyOf({ root, platform: 'linux' })).toEqual({
			from: 'remote',
			key: WORKSPACE_REPO_KEY,
			remote: { host: 'github.com', form: 'scp' },
		})
	})

	it('an origin in https form → the same key', () => {
		const { root } = createConfigWorkspace({ origin: 'https://github.com/example/repo.git' })

		expect(repoKeyOf({ root, platform: 'linux' })).toEqual({
			from: 'remote',
			key: WORKSPACE_REPO_KEY,
			remote: { host: 'github.com', form: 'https' },
		})
	})

	it('an origin keeps its path case on darwin', () => {
		const { root } = createConfigWorkspace({ origin: 'git@github.com:Example/Repo.git' })

		expect(repoKeyOf({ root, platform: 'darwin' })).toEqual({
			from: 'remote',
			key: 'github.com/Example/Repo',
			remote: { host: 'github.com', form: 'scp' },
		})
	})

	it.each([
		{
			name: 'https',
			origin: 'https://GitHub.com/Example/Repo.git',
			remote: { host: 'github.com', form: 'https' },
		},
		{
			name: 'scp',
			origin: 'git@GitHub:Example/Repo.git',
			remote: { host: 'github', form: 'scp' },
		},
		{
			name: 'ssh url with a port',
			origin: 'ssh://git@GIT.Company.com:2222/Example/Repo.git',
			remote: { host: 'git.company.com', form: 'ssh' },
		},
	] as const)(
		'a remote origin in $name form → its host lower-cased and its form, the key unchanged',
		({ origin, remote }) => {
			const { root } = createConfigWorkspace({ origin })

			expect(repoKeyOf({ root, platform: 'linux' })).toEqual({
				from: 'remote',
				key: normalizeRepoKey({ key: origin, platform: 'linux' }),
				remote,
			})
		},
	)

	it.each([
		{ name: 'a path', origin: '/srv/git/repo.git', key: '/srv/git/repo.git' },
		{ name: 'a file URL', origin: 'file:///srv/git/repo.git', key: '/srv/git/repo.git' },
	])('$name origin → no remote, the key unchanged', ({ origin, key }) => {
		const { root } = createConfigWorkspace({ origin })

		expect(repoKeyOf({ root, platform: 'linux' })).toStrictEqual({ from: 'remote', key })
	})

	it('no origin → no remote, the real path as the key', () => {
		const { root } = createConfigWorkspace({ origin: null })

		expect(repoKeyOf({ root, platform: 'linux' })).toStrictEqual({
			from: 'path',
			key: realpathSync(root),
		})
	})

	it.each([
		{ platform: 'darwin', origin: '/Srv/Git/Repo.git', key: '/srv/git/repo.git' },
		{ platform: 'linux', origin: '/Srv/Git/Repo.git', key: '/Srv/Git/Repo.git' },
		{ platform: 'win32', origin: 'C:\\Srv\\Git\\Repo.git', key: 'c:\\srv\\git\\repo.git' },
	] as const)(
		'a local-path origin on $platform → compared as a path on that platform, like a repos: key',
		({ platform, origin, key }) => {
			const { root } = createConfigWorkspace({ origin })

			expect(repoKeyOf({ root, platform })).toEqual({ from: 'remote', key })
		},
	)

	it.each([
		{
			name: 'win32 slashes and case equal the backslash real path',
			platform: 'win32',
			key: 'C:/Users/x/repo',
			expected: 'c:\\users\\x\\repo',
		},
		{
			name: 'win32 trailing backslash dropped',
			platform: 'win32',
			key: 'C:\\Users\\x\\repo\\',
			expected: 'c:\\users\\x\\repo',
		},
		{
			name: 'linux trailing slash dropped',
			platform: 'linux',
			key: '/srv/repo/',
			expected: '/srv/repo',
		},
		{
			name: 'linux doubled and dotted separators collapsed, case kept',
			platform: 'linux',
			key: '/Srv//repo/./',
			expected: '/Srv/repo',
		},
		{
			name: 'darwin trailing slash dropped, then lower-cased',
			platform: 'darwin',
			key: '/Srv/Repo/',
			expected: '/srv/repo',
		},
	] as const)('a repos: path key, $name', ({ platform, key, expected }) => {
		expect(normalizeRepoKey({ key, platform })).toEqual(expected)
	})

	it('a package folder below the repository top, no origin → the real path of the top level', () => {
		const { root } = createConfigWorkspace({ origin: null })
		const packageRoot = join(root, 'packages', 'a')
		mkdirSync(packageRoot, { recursive: true })

		expect(repoKeyOf({ root: packageRoot, platform: 'linux' })).toEqual({
			from: 'path',
			key: realpathSync(root),
		})
	})

	it('no origin → the real path, its case kept on linux', () => {
		const { root } = createConfigWorkspace({ origin: null, rootName: 'MixedCase' })

		expect(repoKeyOf({ root, platform: 'linux' })).toEqual({
			from: 'path',
			key: realpathSync(root),
		})
	})

	it.each(['darwin', 'win32'] as const)(
		'no origin on %s → the real path lower-cased',
		(platform) => {
			const { root } = createConfigWorkspace({ origin: null, rootName: 'MixedCase' })

			expect(repoKeyOf({ root, platform })).toEqual({
				from: 'path',
				key: realpathSync(root).toLowerCase(),
			})
		},
	)
})
