/**
 * `selectionsOf` reads a GraphQL query into the fields it selects, each with its ancestors and the names of its
 * arguments; a fragment, an alias or a directive is answered as a refusal (a value, never a throw), never half-read.
 */
import { QUEUED_QUERY } from './github/github.constants.ts'
import { selectionsOf } from './graphql-selections.ts'

import { describe, expect, it } from 'vitest'

describe('selectionsOf: the fields a query selects', () => {
	it('the queued query → the pull request, and its two queue fields', () => {
		expect(selectionsOf({ query: QUEUED_QUERY })).toEqual([
			{ path: [], field: 'repository', args: ['owner', 'name'] },
			{ path: ['repository'], field: 'pullRequest', args: ['number'] },
			{ path: ['repository', 'pullRequest'], field: 'isInMergeQueue', args: [] },
			{ path: ['repository', 'pullRequest'], field: 'autoMergeRequest', args: [] },
			{
				path: ['repository', 'pullRequest', 'autoMergeRequest'],
				field: 'enabledAt',
				args: [],
			},
		])
	})

	it('a named operation over several lines, siblings after a nested block → document order', () => {
		const query = `query Sample($owner: String!, $first: Int = 10) {
  viewer {
    login
  }
  repository(owner: $owner, name: "fixed") {
    issues(first: $first, states: OPEN) {
      totalCount
    }
    name
  }
}
`

		expect(selectionsOf({ query })).toEqual([
			{ path: [], field: 'viewer', args: [] },
			{ path: ['viewer'], field: 'login', args: [] },
			{ path: [], field: 'repository', args: ['owner', 'name'] },
			{ path: ['repository'], field: 'issues', args: ['first', 'states'] },
			{ path: ['repository', 'issues'], field: 'totalCount', args: [] },
			{ path: ['repository'], field: 'name', args: [] },
		])
	})
})

describe('selectionsOf: what it refuses rather than half-reads', () => {
	it.each([
		{
			name: 'a fragment spread',
			query: 'query { repository { ...Parts } }',
			says: 'fragment',
		},
		{
			name: 'a fragment definition',
			query: 'query { repository { name } } fragment Parts on Repository { id }',
			says: 'fragment',
		},
		{
			name: 'an inline fragment',
			query: 'query { node(id: "x") { ... on Repository { name } } }',
			says: 'fragment',
		},
		{
			name: 'an alias',
			query: 'query { repo: repository(owner: "o", name: "n") { id } }',
			says: 'alias',
		},
		{
			name: 'a directive',
			query:
				'query($show: Boolean!) { repository(owner: "o", name: "n") @include(if: $show) { id } }',
			says: 'directive',
		},
	])('$name → a refusal naming the kind', ({ query, says }) => {
		expect(selectionsOf({ query })).toEqual({ refusal: expect.stringContaining(says) })
	})
})
