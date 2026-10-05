// The longest kills over a range, by distance, as the Analytics card lists them, narrowed to some
// cause tags or with some left out: a weapon's record, a class of weapons, or every shot but the
// mines (whose distance is from whoever laid them, kilometres away).
// ?range=24h|7d|30d&cause=<tag>[,<tag>...]&exclude=<tag>[,<tag>...]&limit=1..25
import { getEnv } from '$lib/server/env';
import { apiJson, int, param, route } from '$lib/server/http';
import { requireServerCap } from '$lib/server/access';
import { longestKills, parseRange, rangeFrom } from '$lib/server/analytics';
import { parseCauseTags } from '$lib/kills';

export const GET = route(async (event) => {
	const env = getEnv();
	const { server } = await requireServerCap(env, event.locals, param(event, 'id'), 'server.view');
	const q = event.url.searchParams;
	const kills = await longestKills(env, server.id, rangeFrom(parseRange(q.get('range'))), {
		causes: parseCauseTags(q.getAll('cause')),
		exclude: parseCauseTags(q.getAll('exclude')),
		limit: int(q.get('limit'), 5, 1, 25)
	});
	return apiJson({ ok: true, kills });
});
