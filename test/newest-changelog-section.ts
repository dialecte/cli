import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The section of the changelog at `root` headed `## [<version>]`: the release that shipped a feature, whatever
 * newer sections sit above it; empty when there is none.
 */
export function changelogSection(params: { root: string; version: string }): string {
	const changelog = readFileSync(join(params.root, 'CHANGELOG.md'), 'utf8')
	const sections = changelog.split(/\n(?=## \[)/).slice(1)
	return sections.find((section) => section.startsWith(`## [${params.version}]`)) ?? ''
}
