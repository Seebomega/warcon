// Infection mode's pure state machine. Observation places joiners and enforces the faction lock;
// kill-feed batches count enemy-attributed deaths and change a victim's assigned faction on the
// configured threshold. The worker owns the state in memory, as Team balance does.
import { settingsFingerprint } from './fingerprint';
import type { Player } from '$lib/types';

export const INFECTION_DEATHS = 3;
export const INFECTION_MOVE_RETRY_MS = 30_000;
export const INFECTION_SIDE_FORGET_MS = 10 * 60_000;
export const INFECTION_WIN = 'infection_win';

export interface InfectionConfig {
	deaths: number;
}

export const infectionSettingsKey = (cfg: InfectionConfig): string => settingsFingerprint(cfg);

interface Assigned {
	faction: string;
	seen: number;
}

interface Deaths {
	count: number;
	byFaction: Map<string, number>;
}

export interface InfectionMove {
	steamId: string;
	name: string;
	from: string | null;
	to: string;
	why: 'join' | 'lock' | 'infected';
	eventId?: string;
}

export interface InfectionState {
	assigned: Map<string, Assigned>;
	deaths: Map<string, Deaths>;
	moving: Map<string, { from: string | null; to: string; at: number }>;
	seeded: boolean;
	hadOpposition: boolean;
	winner: string | null;
}

export const emptyInfectionState = (): InfectionState => ({
	assigned: new Map(),
	deaths: new Map(),
	moving: new Map(),
	seeded: false,
	hadOpposition: false,
	winner: null
});

export function cloneInfectionState(state: InfectionState): InfectionState {
	return {
		assigned: new Map([...state.assigned].map(([id, a]) => [id, { ...a }])),
		deaths: new Map(
			[...state.deaths].map(([id, d]) => [id, { count: d.count, byFaction: new Map(d.byFaction) }])
		),
		moving: new Map([...state.moving].map(([id, m]) => [id, { ...m }])),
		seeded: state.seeded,
		hadOpposition: state.hadOpposition,
		winner: state.winner
	};
}

const factionOf = (p: Pick<Player, 'faction'>, factions: Set<string>): string | null =>
	p.faction && factions.has(p.faction) ? p.faction : null;

/** A least-populated faction, keeping the player's current one when it is tied for least. */
function leastFaction(counts: Map<string, number>, current: string | null): string {
	const least = Math.min(...counts.values());
	if (current && counts.get(current) === least) return current;
	return [...counts].find(([, n]) => n === least)![0];
}

export function infectionObserveStep(
	previous: InfectionState | null,
	players: Player[],
	factionNames: string[],
	now: number,
	maxMoves: number,
	newMatch = false
): { state: InfectionState; moves: InfectionMove[]; winner: string | null } {
	const factions = [...new Set(factionNames.filter(Boolean))].slice(0, 3);
	const allowed = new Set(factions);
	let state = previous ? cloneInfectionState(previous) : emptyInfectionState();
	if (newMatch) {
		state = emptyInfectionState();
		// Unlike enabling the rule in a match already under way, a known new match is ours to spread.
		state.seeded = true;
	}
	const moves: InfectionMove[] = [];
	if (factions.length < 3) return { state, moves, winner: null };

	for (const [id, moving] of state.moving)
		if (now - moving.at >= INFECTION_MOVE_RETRY_MS) state.moving.delete(id);

	const online = new Set(players.map((p) => p.steamId));
	for (const [id, assigned] of state.assigned)
		if (!online.has(id) && now - assigned.seen >= INFECTION_SIDE_FORGET_MS) {
			state.assigned.delete(id);
			state.deaths.delete(id);
			state.moving.delete(id);
		}

	// Enabling Infection mid-round does not reshuffle everyone. Their current sides become the lock;
	// only later joiners are spread. A match boundary clears these assignments above.
	if (!state.seeded) {
		for (const p of players) {
			const faction = factionOf(p, allowed);
			if (faction) state.assigned.set(p.steamId, { faction, seen: now });
		}
		state.seeded = true;
	}

	// A conversion landed when the roster shows its target. Keep the target as the player's lock.
	for (const p of players) {
		const moving = state.moving.get(p.steamId);
		if (moving && p.faction === moving.to) state.moving.delete(p.steamId);
		const assigned = state.assigned.get(p.steamId);
		if (assigned) assigned.seen = now;
	}

	const counts = new Map(factions.map((f) => [f, 0]));
	for (const p of players) {
		const effective = state.moving.get(p.steamId)?.to ?? state.assigned.get(p.steamId)?.faction;
		if (effective && counts.has(effective)) counts.set(effective, counts.get(effective)! + 1);
	}

	const ask = (p: Player, to: string, why: InfectionMove['why']) => {
		if (moves.length >= maxMoves || state.moving.has(p.steamId)) return;
		state.moving.set(p.steamId, { from: p.faction, to, at: now });
		moves.push({ steamId: p.steamId, name: p.name, from: p.faction, to, why });
	};

	// First give every joiner a least-populated team. Then enforce the remembered assignment as a
	// strict faction lock: unlike Team balance, even a switch to a smaller team is reverted.
	for (const p of players) {
		const current = factionOf(p, allowed);
		let assigned = state.assigned.get(p.steamId)?.faction ?? null;
		if (!assigned || !allowed.has(assigned)) {
			assigned = leastFaction(counts, current);
			state.assigned.set(p.steamId, { faction: assigned, seen: now });
			counts.set(assigned, counts.get(assigned)! + 1);
			if (current !== assigned) ask(p, assigned, 'join');
		} else if (current !== null && current !== assigned) ask(p, assigned, 'lock');
	}

	const effectiveSides = new Set(
		players
			.map((p) => state.moving.get(p.steamId)?.to ?? state.assigned.get(p.steamId)?.faction)
			.filter((f): f is string => !!f && allowed.has(f))
	);
	if (effectiveSides.size >= 2) state.hadOpposition = true;
	const actualSides = new Set(
		players.map((p) => factionOf(p, allowed)).filter((f): f is string => f !== null)
	);
	let winner: string | null = null;
	if (
		!state.winner &&
		state.hadOpposition &&
		players.length >= 2 &&
		players.every((player) => factionOf(player, allowed) !== null) &&
		actualSides.size === 1 &&
		!state.moving.size
	) {
		state.winner = [...actualSides][0];
		winner = state.winner;
	}
	return { state, moves, winner };
}

export interface InfectionKill {
	eventId: string;
	killer: { steamId: string; faction: string | null } | null;
	victim: { steamId: string; name: string; faction: string | null };
	teamKill: boolean;
	suicide: boolean;
}

export function infectionKillStep(
	cfg: InfectionConfig,
	previous: InfectionState,
	kills: InfectionKill[],
	now: number
): { state: InfectionState; moves: InfectionMove[] } {
	const state = cloneInfectionState(previous);
	const moves: InfectionMove[] = [];
	if (state.winner) return { state, moves };
	for (const kill of kills) {
		const killerFaction = kill.killer?.faction;
		const victimFaction = kill.victim.faction;
		if (
			kill.teamKill ||
			kill.suicide ||
			!kill.killer?.steamId ||
			!killerFaction ||
			!victimFaction ||
			killerFaction === victimFaction
		)
			continue;
		if (!state.assigned.has(kill.victim.steamId))
			state.assigned.set(kill.victim.steamId, { faction: victimFaction, seen: now });
		const deaths = state.deaths.get(kill.victim.steamId) ?? {
			count: 0,
			byFaction: new Map<string, number>()
		};
		deaths.count++;
		deaths.byFaction.set(killerFaction, (deaths.byFaction.get(killerFaction) ?? 0) + 1);
		state.deaths.set(kill.victim.steamId, deaths);
		if (deaths.count < cfg.deaths) continue;
		const most = Math.max(...deaths.byFaction.values());
		const target =
			deaths.byFaction.get(killerFaction) === most
				? killerFaction
				: [...deaths.byFaction].find(([, count]) => count === most)![0];
		state.deaths.delete(kill.victim.steamId);
		state.assigned.set(kill.victim.steamId, { faction: target, seen: now });
		state.hadOpposition = true;
		if (target === victimFaction) continue;
		state.moving.set(kill.victim.steamId, { from: victimFaction, to: target, at: now });
		moves.push({
			steamId: kill.victim.steamId,
			name: kill.victim.name,
			from: victimFaction,
			to: target,
			why: 'infected',
			eventId: kill.eventId
		});
	}
	return { state, moves };
}
