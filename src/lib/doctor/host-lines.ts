/** The host check of `dialecte doctor --host`: every read of the vendor probed once, through the adapter, then the tool versions. */
import { GIT_FLOOR } from '../git.constants.ts'
import { belowGitFloor, gitVersionOf } from '../git.ts'
import { HOST_READ_METHODS } from '../host/host.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	GIT_SUBJECT,
	HOST_VERSION_TEXTS,
	LEADING_DIGITS,
	UPGRADE_TOOL_FIX,
} from './doctor.constants.ts'

import type {
	HostAdapter,
	HostDescribe,
	HostLine,
	HostReadAdapter,
	HostToolRun,
	HostVendorRecord,
} from '../host/host.types.ts'

/**
 * One line per read of the vendor's table (its probe, in the vendor's order), then the tool versions against the
 * recorded ones and the git floor: an error only for a real failure, a warning for what cannot be probed here.
 *
 * @intent prove the host's reads work on the real tool, through the adapter's own code
 * @internal
 */
export function hostLines(params: {
	root: string
	vendor: HostVendorRecord
	host: HostAdapter
	run: HostToolRun
	describe: HostDescribe
	readGitVersion(params: { root: string }): string
}): HostLine[] {
	const { root, vendor, run } = params
	const host = readAdapterOf({ host: params.host })
	const found = vendor.subject.find({ root, host, run, subject: vendor.subject.call })
	const reads = Object.entries(vendor.probes).map(function probeRead([subject, probe]) {
		return probe({
			root,
			host,
			run,
			subject,
			...(found.changeRequest !== undefined && { changeRequest: found.changeRequest }),
		})
	})
	return [
		found.line,
		...reads,
		...versionLines({ root, vendor, describe: params.describe }),
		gitLine({ root, readGitVersion: params.readGitVersion }),
	]
}

/** The adapter's read methods only (`HOST_READ_METHODS`): what a probe is given, so it cannot write. */
function readAdapterOf(params: { host: HostAdapter }): HostReadAdapter {
	return Object.fromEntries(
		HOST_READ_METHODS.map(function readMethod(name) {
			return [name, params.host[name]]
		}),
	) as HostReadAdapter
}

/** One line per part of the tool the record names: older than recorded warns, newer is ok naming both. */
function versionLines(params: {
	root: string
	vendor: HostVendorRecord
	describe: HostDescribe
}): HostLine[] {
	const { root, vendor } = params
	return Object.entries(vendor.recordedVersions).map(function versionLine([part, recorded]) {
		const subject = `${vendor.tool} ${part}`
		const answer = params.describe.versionOf({ root, selector: part })
		if ('absent' in answer)
			return {
				status: 'warning',
				subject,
				detail: fillMessage({
					template: HOST_VERSION_TEXTS.absent,
					values: { absent: answer.absent, recorded },
				}),
			}
		if ('refusal' in answer) return { status: 'error', subject, detail: answer.refusal }
		const values = { version: answer.version, recorded }
		const order = compareVersions({ left: answer.version, right: recorded })
		if (order < 0)
			return {
				status: 'warning',
				subject,
				detail: fillMessage({ template: HOST_VERSION_TEXTS.older, values }),
				fix: fillMessage({ template: UPGRADE_TOOL_FIX, values: { tool: subject, recorded } }),
			}
		return {
			status: 'ok',
			subject,
			detail: fillMessage({
				template: order > 0 ? HOST_VERSION_TEXTS.newer : HOST_VERSION_TEXTS.asRecorded,
				values,
			}),
		}
	})
}

/** The sign of `left` against `right`, dotted numbers compared one by one (a missing number reads 0). */
function compareVersions(params: { left: string; right: string }): number {
	const left = numbersOfVersion({ version: params.left })
	const right = numbersOfVersion({ version: params.right })
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0)
		if (difference !== 0) return Math.sign(difference)
	}
	return 0
}

/** The leading number of each dotted part (`2.104.1-pre` reads 2, 104, 1); a part with none reads 0, never NaN. */
function numbersOfVersion(params: { version: string }): number[] {
	return params.version.split('.').map(function leadingNumber(part) {
		const digits = LEADING_DIGITS.exec(part)?.[0]
		return digits === undefined ? 0 : Number(digits)
	})
}

/** The git on PATH against the floor: below it, or a line that is no version, is an error. */
function gitLine(params: {
	root: string
	readGitVersion(params: { root: string }): string
}): HostLine {
	let text: string
	try {
		text = params.readGitVersion({ root: params.root })
	} catch (error) {
		return {
			status: 'error',
			subject: GIT_SUBJECT,
			detail: error instanceof Error ? error.message : String(error),
		}
	}
	const version = gitVersionOf({ text })
	if (version !== undefined && !belowGitFloor({ version }))
		return { status: 'ok', subject: GIT_SUBJECT, detail: version.line }
	return {
		status: 'error',
		subject: GIT_SUBJECT,
		detail: fillMessage({
			template: HOST_VERSION_TEXTS.gitFloor,
			values: { floor: GIT_FLOOR.join('.'), line: version?.line ?? (text.trim() || 'nothing') },
		}),
	}
}
