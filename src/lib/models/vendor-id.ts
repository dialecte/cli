import { VENDOR_IDS } from './model-tiers.constants.ts'

import type { VendorId } from './model-tiers.types.ts'

export function isVendorId(value: string): value is VendorId {
	return (VENDOR_IDS as readonly string[]).includes(value)
}
