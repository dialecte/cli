import { escapeControlCharacters } from '../print/print.ts'
import { isTerminalState } from '../store/lot-state.ts'

import type { RenderOrchestratorStateParams } from './orchestrator.types.ts'

export function renderOrchestratorState(params: RenderOrchestratorStateParams): string {
	const sections = [
		status(params),
		waiting(params),
		runners(params),
		lanes(params),
		lots(params),
		held(params),
		next(params),
		recent({ records: params.records.slice(-10) }),
	]
	return `${sections.map((lines) => lines.join('\n')).join('\n\n')}\n`
}

function status(params: RenderOrchestratorStateParams): string[] {
	const { state } = params
	return [
		`Status: ${String(state.runs.length)} runs, ${String(state.waitingOnYou.length)} waiting, ${String(state.next.length)} next`,
	]
}

function waiting(params: RenderOrchestratorStateParams): string[] {
	return section({
		name: 'Waiting on you',
		lines: params.state.waitingOnYou.map(
			(item) =>
				`- ${safe(item.id)}: kind=${safe(item.kind)}; text=${safe(item.text)}; line=${optional(
					item.line,
				)}; options=${list(item.options)}`,
		),
	})
}

function runners(params: RenderOrchestratorStateParams): string[] {
	return section({
		name: 'Runners',
		lines: params.state.runners.map(
			(runner) =>
				`- ${safe(runner.id)}: available=${String(runner.available)}; until=${optional(
					runner.until,
				)}; tokensSinceReset=${String(runner.tokensSinceReset)}; usage=${optional(runner.usage)}`,
		),
	})
}

function lanes(params: RenderOrchestratorStateParams): string[] {
	return section({
		name: 'Lanes',
		lines: params.state.lanes.map(
			(lane) =>
				`- ${safe(lane.name)}: repos=${list(lane.repos)}; holds=${list(lane.holds)}; owns=${list(
					lane.owns,
				)}; mode=${safe(lane.mode)}; plan=${safe(lane.plan)}; queue=${list(lane.queue)}${optionalField(
					{
						name: 'pin',
						value: lane.pin,
					},
				)}`,
		),
	})
}

function lots(params: RenderOrchestratorStateParams): string[] {
	return section({
		name: 'Lots in flight',
		lines: params.state.lots
			.filter((lot) => !isTerminalState(lot.state))
			.map(
				(lot) =>
					`- ${safe(lot.id)}: lane=${safe(lot.lane)}; repo=${safe(lot.repo)}; state=${safe(
						lot.state,
					)}; station=${safe(lot.station)}; attempt=${String(lot.attempt)}; pr=${safe(
						lot.pr,
					)}; head=${safe(lot.head)}${lot.run === undefined ? '' : `; run=${safe(lot.run.runner)}/${safe(lot.run.handle)}`}`,
			),
	})
}

function held(params: RenderOrchestratorStateParams): string[] {
	return section({
		name: 'Held',
		lines: params.state.held.map(
			(item) =>
				`- ${safe(item.item)}: by=${safe(item.by)}; since=${safe(item.since)}; until=${optional(
					item.until,
				)}`,
		),
	})
}

function next(params: RenderOrchestratorStateParams): string[] {
	return section({
		name: 'Next',
		lines: params.state.next.map((item) => `- ${safe(item.lane)}: ${safe(item.lot)}`),
	})
}

function recent(params: { records: RenderOrchestratorStateParams['records'] }): string[] {
	return section({
		name: 'Recent',
		lines: params.records.map(
			(event) =>
				`- ${safe(event.at)} ${safe(event.kind)} ${safe(event.subject)} ${safe(event.id)} ${safe(
					JSON.stringify(event.facts),
				)}`,
		),
	})
}

function section(params: { name: string; lines: readonly string[] }): string[] {
	return [`## ${params.name}`, ...(params.lines.length === 0 ? ['none'] : params.lines)]
}

function list(values: readonly string[] | undefined): string {
	return values === undefined || values.length === 0 ? 'none' : values.map(safe).join(', ')
}

function optional(value: string | undefined): string {
	return value === undefined ? 'none' : safe(value)
}

function optionalField(params: { name: string; value: string | undefined }): string {
	return params.value === undefined ? '' : `; ${params.name}=${safe(params.value)}`
}

function safe(text: string): string {
	return escapeControlCharacters({ text })
}
