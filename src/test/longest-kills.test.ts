// The longest-kills route: by distance over the range, suicides and team kills left out as on the
// Analytics card, narrowed by `cause` or with `exclude` left out, both whole and in any case.
import { beforeAll, describe, expect, test } from 'bun:test';
import type { Env } from '$lib/server/env';
import { kills } from '$lib/server/db/schema';
import type { LongestKill } from '$lib/server/analytics';
import { hasTestDb, testEnv } from './db';
import { callApi, stubGateway } from './call';
import { seedWorld, type World } from './world';
import { GET as longestRoute } from '../routes/api/servers/[id]/kills/longest/+server';

const A = '76561198000000093';
const B = '76561198000000094';
const DAY = 86_400_000;

/** [eventId, cause, metres, age in ms, extra columns] */
const ROWS: [string, string | null, number | null, number, Record<string, unknown>?][] = [
	['mine', 'ID.Item.ATMine', 6000, 60_000],
	['sv98', 'Id.Item.SV98', 900, 60_000],
	['ak', 'Id.Item.AK74M', 400, 60_000],
	['m4a', 'Id.Item.M4', 300, 60_000],
	['m4b', 'Id.Item.M4', 250, 60_000],
	['twodays', 'Id.Item.MK22', 700, 2 * DAY],
	['old', 'Id.Item.SV98', 5000, 40 * DAY],
	['tk', 'Id.Item.SV98', 2000, 60_000, { teamKill: true }],
	['self', 'Id.Item.SV98', 3000, 60_000, { suicide: true }],
	['nodist', 'Id.Item.SV98', null, 60_000]
];

describe.skipIf(!hasTestDb)('the longest-kills route', () => {
	let env: Env;
	let w: World;

	beforeAll(async () => {
		env = await testEnv();
		stubGateway();
		w = await seedWorld(env);
		await env.db.insert(kills).values(
			ROWS.map(([eventId, cause, distanceM, age, extra], i) => ({
				ts: new Date(Date.now() - age),
				serverId: w.server.id,
				eventId: `lk-${eventId}`,
				instanceId: 'i',
				matchId: 'g',
				eventTime: i,
				map: 'Kavkazi',
				killerSteamId: A,
				killerName: 'Ghostpepper',
				killerFaction: 'Valkyra',
				victimSteamId: B,
				victimName: 'T0XIC_AVENGER',
				victimFaction: 'Lonestar',
				cause,
				distanceM,
				tags: [],
				...extra
			}))
		);
	});

	const metres = async (query: string) => {
		const r = await callApi(longestRoute, w.users.viewer, { params: { id: w.server.id }, query });
		expect(r.status).toBe(200);
		return (r.body as { kills: LongestKill[] }).kills.map((k) => k.distanceM);
	};

	test('longest first over the range, without suicides, team kills or kills with no distance', async () => {
		expect(await metres('range=30d')).toEqual([6000, 900, 700, 400, 300]);
		expect(await metres('range=30d&limit=25')).toEqual([6000, 900, 700, 400, 300, 250]);
	});

	test('the range bounds it: two days ago is in 7d, not in 24h', async () => {
		expect(await metres('range=7d&limit=25')).toContain(700);
		expect(await metres('range=24h&limit=25')).not.toContain(700);
	});

	test('cause keeps those tags, whole and in any case, repeated or comma-separated', async () => {
		expect(await metres('range=30d&cause=Id.Item.M4')).toEqual([300, 250]);
		expect(await metres('range=30d&cause=id.item.m4,Id.Item.AK74M')).toEqual([400, 300, 250]);
		expect(await metres('range=30d&cause=Id.Item.M4&cause=ID.ITEM.SV98')).toEqual([900, 300, 250]);
		expect(await metres('range=30d&cause=Id.Item.M')).toEqual([]);
	});

	test('exclude leaves tags out: every shot but the mines', async () => {
		expect(await metres('range=30d&exclude=Id.Item.ATMine')).toEqual([900, 700, 400, 300, 250]);
		expect(
			await metres('range=30d&cause=Id.Item.M4,Id.Item.ATMine&exclude=id.item.atmine')
		).toEqual([300, 250]);
	});

	test('limit is bounded', async () => {
		expect(await metres('range=30d&limit=2')).toHaveLength(2);
		expect(await metres('range=30d&limit=0')).toHaveLength(1);
	});
});
