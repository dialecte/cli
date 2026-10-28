import type { ApiJson, PackagedMethod } from './api-json.types.ts'

/**
 * `dialecte api show <path>`: the methods a path names - the whole route (`doc.query.info.of`), another
 * route of the same method, `q.` for `doc.query.`, or the end of a route (`info.of`). An exact route wins
 * over route ends.
 */
export function findByPath(params: {
	indexes: readonly ApiJson[]
	path: string
}): PackagedMethod[] {
	const path = params.path.replace(/^q\./, 'doc.query.')
	const methods = params.indexes.flatMap((index) =>
		index.methods.map((method) => ({ method, packageName: index.package })),
	)
	const exact = methods.filter(({ method }) => routesOf(method).includes(path))
	if (exact.length > 0) return exact
	return methods.filter(({ method }) =>
		routesOf(method).some((route) => route.endsWith(`.${path}`)),
	)
}

function routesOf(method: PackagedMethod['method']): string[] {
	return [method.path, ...method.otherRoutes]
}
