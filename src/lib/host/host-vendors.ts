/** The one list of runtime host vendors. */
import { GITHUB_VENDOR } from './github/github-vendor.ts'

import type { HostVendorRecord } from './host.types.ts'

export const HOST_VENDORS: readonly HostVendorRecord[] = [GITHUB_VENDOR]
