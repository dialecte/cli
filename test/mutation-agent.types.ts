import type { PacketInput } from '../src/lib/mutation/mutation-agent.types.ts'
import type { recordKeys } from '../src/lib/mutation/records-write.ts'

export type PacketCall = { survivors: PacketInput[]; source?: string | undefined; file?: string }

export type ClassifyCase = {
	source: string | undefined
	mutator: string
	original: string
	file?: string
	replacement?: string
}

export type RecordCall = Partial<Parameters<typeof recordKeys>[0]>
