// The longest kills over a range, by distance, as the Analytics card lists them, narrowed to some
// cause tags or with some left out: a weapon's record, a class of weapons, or every shot but the
// mines (whose distance is from whoever laid them, kilometres away). `maxM` drops what lies beyond
// it, as `minM` does below on the kills route: the feed carries the odd impossible distance.
// ?range=24h|7d|30d&cause=<tag>[,<tag>...]&exclude=<tag>[,<tag>...]&maxM=<m>&limit=1..25
import { getEnv } from '$lib/server/env';
import { apiJson, int, param, route } from '$lib/server/http';
import { requireServerCap } from '$lib/server/access';
import { longestKills, parseRange, rangeFrom } from '$lib/server/analytics';
import { parseCauseTags } from '$lib/kills';

export const GET = route(async (event) => {
	const env = getEnv();
	const { server } = await requireServerCap(env, event.locals, param(event, 'id'), 'server.view');
	const q = event.url.searchParams;
	const max = Number(q.get('maxM'));
	const kills = await longestKills(env, server.id, rangeFrom(parseRange(q.get('range'))), {
		causes: parseCauseTags(q.getAll('cause')),
		exclude: parseCauseTags(q.getAll('exclude')),
		maxM: q.get('maxM') && Number.isFinite(max) && max > 0 ? Math.round(max) : null,
		limit: int(q.get('limit'), 5, 1, 25)
	});
	return apiJson({ ok: true, kills });
});
