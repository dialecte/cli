import { checkStationDefinitions } from './check-station-definitions.ts'

import { describe, expect, it } from 'vitest'

/** The cli's station table, pinned here as the brief states it. */
const PINS: [string, string, string][] = [
	['test-writer', 'standard', 'edit'],
	['test-reviewer', 'strong', 'review'],
	['implementer', 'standard', 'edit'],
	['implementer-strong', 'strong', 'edit'],
	['reviewer', 'strong', 'review'],
	['fixer', 'standard', 'edit'],
	['eval-runner', 'standard', 'edit'],
	['grader', 'strong', 'read'],
	['standard-reader', 'standard', 'read'],
	['searcher', 'fast', 'read'],
]

function section(params: { name: string; tier: string; access: string; extra?: string }): string {
	return `### ${params.name}\n\nWhat it does.\n\n- Tier: ${params.tier}\n${params.extra ?? ''}- Access: ${params.access}\n\nWhat it leaves.\n`
}

function stationsMarkdown(
	params: { skip?: string; override?: Record<string, string> } = {},
): string {
	const sections = PINS.filter(([name]) => name !== params.skip).map(([name, tier, access]) =>
		params.override?.[name] !== undefined ? params.override[name] : section({ name, tier, access }),
	)
	return `# Stations\n\nIntro.\n\n${sections.join('\n')}`
}

/** A finding whose message holds the text, or matches the pattern. */
function msg(expected: string | RegExp): unknown {
	return expect.objectContaining({
		severity: 'error',
		message:
			typeof expected === 'string'
				? expect.stringContaining(expected)
				: expect.stringMatching(expected),
	})
}

describe('checkStationDefinitions', () => {
	it('every station with the cli tier and access -> no finding', () => {
		expect(checkStationDefinitions({ markdown: stationsMarkdown() })).toEqual([])
	})

	it('the file missing -> one error finding naming references/stations.md', () => {
		expect(checkStationDefinitions({ markdown: undefined })).toEqual([
			expect.objectContaining({
				severity: 'error',
				file: expect.stringContaining('references/stations.md'),
			}),
		])
	})

	it('a station without its section -> one finding naming it', () => {
		expect(checkStationDefinitions({ markdown: stationsMarkdown({ skip: 'fixer' }) })).toEqual([
			msg('fixer'),
		])
	})

	it('a wrong Tier line -> one finding naming the station, expected and found', () => {
		expect(
			checkStationDefinitions({
				markdown: stationsMarkdown({
					override: { grader: section({ name: 'grader', tier: 'fast', access: 'read' }) },
				}),
			}),
		).toEqual([msg(/grader.*Tier.*fast.*strong|grader.*Tier.*strong.*fast/s)])
	})

	it('a wrong Access line -> one finding naming the station, expected and found', () => {
		expect(
			checkStationDefinitions({
				markdown: stationsMarkdown({
					override: { reviewer: section({ name: 'reviewer', tier: 'strong', access: 'edit' }) },
				}),
			}),
		).toEqual([msg(/reviewer.*Access.*review.*edit|reviewer.*Access.*edit.*review/s)])
	})

	it('a section without a Tier line, and one without an Access line -> one finding each', () => {
		expect(
			checkStationDefinitions({
				markdown: stationsMarkdown({
					override: {
						grader: '### grader\n\n- Access: read\n',
						searcher: '### searcher\n\n- Tier: fast\n',
					},
				}),
			}),
		).toEqual([msg(/grader.*Tier/s), msg(/searcher.*Access/s)])
	})

	it('the lines may sit anywhere in the section, before the next ### or ## heading', () => {
		const spread =
			'### grader\n\nText first.\n\nMore text.\n\n- Tier: strong\n\nMiddle.\n\n- Access: read\n'

		expect(
			checkStationDefinitions({ markdown: stationsMarkdown({ override: { grader: spread } }) }),
		).toEqual([])
	})

	it('a Tier line in the next section does not count for the one before it', () => {
		const bare = '### grader\n\nNothing here.\n'

		expect(
			checkStationDefinitions({ markdown: stationsMarkdown({ override: { grader: bare } }) }),
		).toEqual([msg(/grader.*Tier/s), msg(/grader.*Access/s)])
	})

	it('a ## heading closes the last station section', () => {
		const markdown = `${stationsMarkdown({ skip: 'searcher' })}\n### searcher\n\n- Tier: fast\n\n## Other\n\n- Access: read\n`

		expect(checkStationDefinitions({ markdown: markdown })).toEqual([msg(/searcher.*Access/s)])
	})

	it('the lines are list items in plain words: backticks or a missing dash -> a finding per line', () => {
		const ticked = '### grader\n\n- Tier: `strong`\n- Access: `read`\n'
		const dashless = '### searcher\n\nTier: fast\nAccess: read\n'

		expect(
			checkStationDefinitions({
				markdown: stationsMarkdown({ override: { grader: ticked, searcher: dashless } }),
			}),
		).toEqual([
			msg(/grader.*Tier/s),
			msg(/grader.*Access/s),
			msg(/searcher.*Tier/s),
			msg(/searcher.*Access/s),
		])
	})

	it('a section for a station the cli does not know -> one finding naming it', () => {
		expect(
			checkStationDefinitions({
				markdown: `${stationsMarkdown()}\n${section({ name: 'planner', tier: 'fast', access: 'read' })}`,
			}),
		).toEqual([msg('planner')])
	})

	it('two sections of the same station -> one finding naming it as a duplicate', () => {
		const twice = `${stationsMarkdown()}\n${section({ name: 'grader', tier: 'strong', access: 'read' })}`

		expect(checkStationDefinitions({ markdown: twice })).toEqual([
			msg(/grader.*more than one section/is),
		])
	})

	it('a ### Notes section (no Tier or Access line) -> ignored, no finding', () => {
		const notes = '### Notes\n\nSome words about hosts.\n'

		expect(checkStationDefinitions({ markdown: `${stationsMarkdown()}\n${notes}` })).toEqual([])
	})

	it('### headings inside a fenced block -> ignored', () => {
		const fenced = '```md\n### planner\n\n- Tier: fast\n- Access: read\n```\n'

		expect(checkStationDefinitions({ markdown: `${stationsMarkdown()}\n${fenced}` })).toEqual([])
	})

	it('a fenced block inside a station section does not end it', () => {
		const withFence = '### grader\n\n```md\n### inner\n```\n\n- Tier: strong\n- Access: read\n'

		expect(
			checkStationDefinitions({ markdown: stationsMarkdown({ override: { grader: withFence } }) }),
		).toEqual([])
	})

	it('a ### planner section with Tier and Access lines -> still an unknown station', () => {
		expect(
			checkStationDefinitions({
				markdown: `${stationsMarkdown()}\n${section({ name: 'planner', tier: 'fast', access: 'read' })}`,
			}),
		).toEqual([msg('planner')])
	})

	it('"- Tier: Strong" -> a finding saying it says Strong (expected strong), not that the line is missing', () => {
		const capital = section({ name: 'grader', tier: 'Strong', access: 'read' })

		const findings = checkStationDefinitions({
			markdown: stationsMarkdown({ override: { grader: capital } }),
		})

		expect(findings).toEqual([msg(/grader.*Tier.*Strong.*strong/s)])
		expect(findings.map((found) => found.message).join('\n')).not.toMatch(/no `- Tier/)
	})
})
