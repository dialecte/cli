import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The newest section of the changelog at `root` that holds entries: `## [Unreleased]` while it has any, else the
 * version released last. A docs test reads this one, so it holds before and after a release moves the entries
 * under a version heading.
 */
export function newestChangelogSection(params: { root: string }): string {
	const changelog = readFileSync(join(params.root, 'CHANGELOG.md'), 'utf8')
	const sections = changelog.split(/\n(?=## \[)/).slice(1)
	return sections.find((section) => section.split('\n').slice(1).join('').trim() !== '') ?? ''
}
