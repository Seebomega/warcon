import { describe, expect, test } from 'bun:test';
import {
	emptyInfectionState,
	infectionKillStep,
	infectionObserveStep,
	type InfectionKill
} from './infection';
import type { Player } from '$lib/types';

const factions = ['Lonestar', 'Valkyra', 'Manticore'];
const player = (steamId: string, faction: string | null): Player => ({
	steamId,
	name: steamId,
	faction,
	kills: 0,
	deaths: 0,
	cash: 0,
	ping: 20
});
const kill = (
	id: string,
	victimFaction: string | null,
	killerFaction: string | null,
	extra: Partial<InfectionKill> = {}
): InfectionKill => ({
	eventId: id,
	killer: killerFaction ? { steamId: `k-${id}`, faction: killerFaction } : null,
	victim: { steamId: 'victim', name: 'Victim', faction: victimFaction },
	teamKill: false,
	suicide: false,
	...extra
});

describe('Infection mode', () => {
	test('keeps an existing round in place, spreads joiners over three teams, and locks factions', () => {
		const first = infectionObserveStep(
			null,
			[player('a', 'Lonestar'), player('b', 'Valkyra')],
			factions,
			1,
			6
		);
		expect(first.moves).toEqual([]);
		const joined = infectionObserveStep(
			first.state,
			[player('a', 'Lonestar'), player('b', 'Valkyra'), player('c', 'Lonestar')],
			factions,
			2,
			6
		);
		expect(joined.moves).toMatchObject([
			{ steamId: 'c', from: 'Lonestar', to: 'Manticore', why: 'join' }
		]);
		const landed = infectionObserveStep(
			joined.state,
			[player('a', 'Lonestar'), player('b', 'Valkyra'), player('c', 'Manticore')],
			factions,
			3,
			6
		);
		const switched = infectionObserveStep(
			landed.state,
			[player('a', 'Valkyra'), player('b', 'Valkyra'), player('c', 'Manticore')],
			factions,
			4,
			6
		);
		expect(switched.moves).toMatchObject([
			{ steamId: 'a', from: 'Valkyra', to: 'Lonestar', why: 'lock' }
		]);
	});

	test('only enemy-attributed deaths count, then the most frequent killer faction takes the victim', () => {
		const state = emptyInfectionState();
		const result = infectionKillStep(
			{ deaths: 3 },
			state,
			[
				kill('environment', 'Lonestar', null),
				kill('suicide', 'Lonestar', 'Lonestar', { suicide: true }),
				kill('team', 'Lonestar', 'Lonestar', { teamKill: true }),
				kill('one', 'Lonestar', 'Valkyra'),
				kill('two', 'Lonestar', 'Manticore'),
				kill('three', 'Lonestar', 'Valkyra')
			],
			10
		);
		expect(result.moves).toMatchObject([
			{ steamId: 'victim', from: 'Lonestar', to: 'Valkyra', why: 'infected' }
		]);
		expect(result.state.deaths.has('victim')).toBe(false);
	});

	test('a three-way tie is won by the faction that dealt the threshold death', () => {
		const result = infectionKillStep(
			{ deaths: 3 },
			emptyInfectionState(),
			[
				kill('one', 'Lonestar', 'Valkyra'),
				kill('two', 'Lonestar', 'Manticore'),
				kill('three', 'Lonestar', 'Third')
			],
			10
		);
		expect(result.moves[0].to).toBe('Third');
	});

	test('declares a winner only after opposing teams existed and every move landed', () => {
		let step = infectionObserveStep(
			null,
			[player('a', 'Lonestar'), player('b', 'Valkyra')],
			factions,
			1,
			6
		);
		step.state.assigned.set('b', { faction: 'Lonestar', seen: 2 });
		step.state.moving.set('b', { from: 'Valkyra', to: 'Lonestar', at: 2 });
		step = infectionObserveStep(
			step.state,
			[player('a', 'Lonestar'), player('b', 'Lonestar')],
			factions,
			3,
			6
		);
		expect(step.winner).toBe('Lonestar');
	});

	test('does not declare a winner while any player has no known faction', () => {
		let step = infectionObserveStep(
			null,
			[player('a', 'Lonestar'), player('b', 'Valkyra')],
			factions,
			1,
			6
		);
		step.state.assigned.set('b', { faction: 'Lonestar', seen: 2 });
		step = infectionObserveStep(
			step.state,
			[player('a', 'Lonestar'), player('b', null)],
			factions,
			3,
			6
		);
		expect(step.winner).toBeNull();
	});
});
