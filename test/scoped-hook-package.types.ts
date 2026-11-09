import type { GateStep } from '../src/lib/gate/gate-config.types.ts'

/** Where a package's scoped step is: in `fast` and `full`, nowhere, only in `fast`, or only in `release`. */
export type GateLayout = 'full' | 'none' | 'fast-only' | 'release-only'

/** The gate lists of a scratch package. */
export type ScopedHookGate = { fast?: GateStep[]; full?: GateStep[]; release?: GateStep[] }
