import type { ConfigFinding, ConfigValue } from './config.types.ts'

/** A finding with whether every reader refuses it (D6) or only `check` reports it (an unknown key). */
export type ConfigCheck = { finding: ConfigFinding; refused: boolean }

/** What one file brings: its checks and the values it would give (none when the file is refused whole). */
export type ConfigLayerRead = { checks: ConfigCheck[]; candidates: ConfigValue[] }
