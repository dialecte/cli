/** A remote URL in its shared form (D7): scheme, user, port, .git, trailing slash dropped, host lowercased, path case kept. */
import { normalizeRemote } from './normalize-remote.ts'

import { describe, expect, it } from 'vitest'

const CASES: { url: string; expected: string }[] = [
	{ url: 'git@github.com:example/repo.git', expected: 'github.com/example/repo' },
	{ url: 'https://github.com/example/repo.git', expected: 'github.com/example/repo' },
	{ url: 'https://person-a@GitHub.com/example/repo', expected: 'github.com/example/repo' },
	{ url: 'ssh://git@github.com:22/example/repo.git', expected: 'github.com/example/repo' },
	{ url: 'https://github.com/example/repo/', expected: 'github.com/example/repo' },
	{ url: 'git+https://github.com/example/repo.git', expected: 'github.com/example/repo' },
	{ url: 'https://github.com/Example/Repo', expected: 'github.com/Example/Repo' },
]

describe('normalizeRemote', () => {
	it.each(CASES)('$url', ({ url, expected }) => {
		expect(normalizeRemote(url)).toBe(expected)
	})
})
