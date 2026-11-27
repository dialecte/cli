/** The vendor a project uses, from the agent folders and files present in it. */
import { VENDOR_HOSTS, VENDOR_IDS } from './model-tiers.constants.ts'

import type { VendorDetection } from './model-tiers.types.ts'

/** `presentPaths`: project-relative paths that exist (`.claude`, `AGENTS.md`, `.github/skills`...). */
export function detectVendor(params: { presentPaths: ReadonlySet<string> }): VendorDetection {
	const hosts = VENDOR_HOSTS.filter((host) =>
		host.anyOf.some((paths) => paths.every((path) => params.presentPaths.has(path))),
	)
	if (hosts.length === 0) return { kind: 'none' }
	if (hosts.length === 1 && hosts[0].vendors.length === 1)
		return { kind: 'one', vendor: hosts[0].vendors[0], agent: hosts[0].agent }
	const served = new Set(hosts.flatMap((host) => host.vendors))
	return { kind: 'choose', candidates: VENDOR_IDS.filter((vendor) => served.has(vendor)) }
}
