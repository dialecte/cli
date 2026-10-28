/** The vendor a project uses, from the agent folders and files present in it. */
import { VENDOR_HOSTS, VENDOR_IDS } from './model-tiers.constants.ts'

import type { VendorDetection, VendorId } from './model-tiers.types.ts'

/** `presentPaths`: project-relative paths that exist (`.claude`, `AGENTS.md`, `.github/skills`...). */
export function detectVendor(params: { presentPaths: ReadonlySet<string> }): VendorDetection {
	const hosts = VENDOR_HOSTS.filter((host) =>
		host.anyOf.some((paths) => paths.every((path) => params.presentPaths.has(path))),
	)
	if (hosts.length === 0) return { kind: 'none' }
	if (hosts.some((host) => 'multiVendor' in host))
		return { kind: 'choose', candidates: [...VENDOR_IDS] }
	const vendors = hosts.flatMap((host): VendorId[] => ('vendor' in host ? [host.vendor] : []))
	if (hosts.length === 1 && vendors.length === 1)
		return { kind: 'one', vendor: vendors[0], agent: hosts[0].agent }
	return { kind: 'choose', candidates: vendors }
}
