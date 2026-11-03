import { STATIONS } from '../stations/station-agents.constants.ts'
import {
	DEFINITION_LINE_PATTERN,
	FENCE_PATTERN,
	SECTION_BOUNDARY_PATTERN,
	STATIONS_FILE,
	STATION_HEADING_PATTERN,
} from './check-station-definitions.constants.ts'

import type { StationDefinition } from '../stations/station-agents.types.ts'
import type { StationSection } from './check-station-definitions.types.ts'
import type { SkillFinding } from './skill-file.types.ts'

/** The findings on `skills/dialecte-lot/references/stations.md` against the cli's station table. */
export function checkStationDefinitions(params: { markdown: string | undefined }): SkillFinding[] {
	if (params.markdown === undefined)
		return [finding(`missing: it defines the stations the cli writes agents for`)]
	const sections = readSections(params.markdown)
	const findings = STATIONS.flatMap((station) => checkStation({ station, sections }))
	const known = new Set<string>(STATIONS.map((station) => station.name))
	for (const section of sections)
		if (!known.has(section.name) && holdsDefinitionLine(section))
			findings.push(finding(`section "${section.name}" is no station of the cli`))
	return findings
}

function finding(message: string): SkillFinding {
	return { file: STATIONS_FILE, severity: 'error', message }
}

/** A `### <name>` section is a station's only when it holds a `Tier:` or `Access:` list line. */
function holdsDefinitionLine(section: StationSection): boolean {
	return section.lines.some((line) => DEFINITION_LINE_PATTERN.test(line))
}

/** The `###` sections; a heading of level 1 to 3 ends the one before it; fenced blocks are code, not headings. */
function readSections(markdown: string): StationSection[] {
	const sections: StationSection[] = []
	let current: StationSection | undefined
	let fenced = false
	for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
		if (FENCE_PATTERN.test(line)) fenced = !fenced
		if (fenced || FENCE_PATTERN.test(line)) continue
		const name = STATION_HEADING_PATTERN.exec(line)?.[1]
		if (name !== undefined) {
			current = { name, lines: [] }
			sections.push(current)
		} else if (SECTION_BOUNDARY_PATTERN.test(line)) current = undefined
		else current?.lines.push(line)
	}
	return sections
}

function checkStation(params: {
	station: StationDefinition
	sections: StationSection[]
}): SkillFinding[] {
	const { station } = params
	const own = params.sections.filter((section) => section.name === station.name)
	if (own.length === 0) return [finding(`station "${station.name}" has no section`)]
	if (own.length > 1) return [finding(`station "${station.name}" has more than one section`)]
	return [
		...checkLine({ station, section: own[0], label: 'Tier', expected: station.tier }),
		...checkLine({ station, section: own[0], label: 'Access', expected: station.access }),
	]
}

/** The `- <label>: <word>` list line of a section against the cli's value. */
function checkLine(params: {
	station: StationDefinition
	section: StationSection
	label: string
	expected: string
}): SkillFinding[] {
	const { station, section, label, expected } = params
	const pattern = new RegExp(`^- ${label}: (\\S+)\\s*$`)
	const found = section.lines.map((line) => pattern.exec(line)?.[1]).find((value) => value)
	if (found === undefined)
		return [
			finding(
				`station "${station.name}": no \`- ${label}: <value>\` line (the cli has ${expected})`,
			),
		]
	if (found !== expected)
		return [
			finding(`station "${station.name}": ${label} line says ${found}, the cli has ${expected}`),
		]
	return []
}
