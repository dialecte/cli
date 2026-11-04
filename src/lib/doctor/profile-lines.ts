/**
 * `dialecte doctor`: the package's profile, and what in its package.json or skills does not follow it - a consumer
 * allowing tags it already may hold, a contributor whose `gate --full` still runs the contributor steps or whose
 * skills were synced without the contributor ones. A value that is no profile is an error line, never a crash.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { DEFAULT_CONTRIB_STEPS } from '../contrib/contrib.constants.ts'
import { readPackageJson } from '../package-json.ts'
import { readProfile } from '../profile/profile.ts'
import { AGENT_SKILL_FOLDERS, MANIFEST_FILE } from '../skills/sync-skills.constants.ts'
import { readSyncManifest } from '../skills/sync-skills.ts'
import {
	CONSUMER_ALLOWS_REFERENCES,
	CONTRIBUTOR_GATE_STEPS,
	CONTRIBUTOR_SKILLS_NOT_SYNCED,
	PROFILE_SUBJECT,
} from './doctor.constants.ts'

import type { Profile } from '../profile/profile.types.ts'
import type { DoctorLine } from './doctor.types.ts'

export function profileLines(cwd: string): DoctorLine[] {
	let profile: Profile
	try {
		profile = readProfile(cwd)
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error)
		return [{ status: 'error', subject: PROFILE_SUBJECT, detail }]
	}
	const dialecte = readPackageJson(cwd).dialecte
	if (profile === 'consumer') {
		const declared = dialecte?.profile === undefined ? 'consumer (default)' : 'consumer'
		return [
			{ status: 'ok', subject: PROFILE_SUBJECT, detail: declared },
			...(dialecte?.allowReferences === undefined
				? []
				: [
						{
							status: 'warning' as const,
							subject: PROFILE_SUBJECT,
							detail: CONSUMER_ALLOWS_REFERENCES,
						},
					]),
		]
	}
	const full = Array.isArray(dialecte?.gate?.full) ? dialecte.gate.full : []
	const contributorSteps = DEFAULT_CONTRIB_STEPS.map((step) => step.name)
	const moved = full.map((step) => step.name).filter((name) => contributorSteps.includes(name))
	const unsynced = Object.values(AGENT_SKILL_FOLDERS).filter(
		(folder) =>
			existsSync(join(cwd, folder, MANIFEST_FILE)) &&
			readSyncManifest(join(cwd, folder)).contributing !== true,
	)
	return [
		{ status: 'ok', subject: PROFILE_SUBJECT, detail: 'contributor' },
		...(moved.length
			? [
					{
						status: 'warning' as const,
						subject: PROFILE_SUBJECT,
						detail: CONTRIBUTOR_GATE_STEPS.replace('{steps}', moved.join(', ')),
					},
				]
			: []),
		...unsynced.map((folder): DoctorLine => ({
			status: 'warning',
			subject: PROFILE_SUBJECT,
			detail: CONTRIBUTOR_SKILLS_NOT_SYNCED.replace('{folder}', folder),
		})),
	]
}
