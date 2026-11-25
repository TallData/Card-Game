import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_PRESTIGE,
  MAX_ROUNDS,
  newGame,
  current,
  playIssue,
  play,
  buy,
  build,
  endTurn,
  cpuStep,
  cpuTurn
} from '../dist/engine.js';

test('newGame initializes schema 2, shuffled 10-card starter, 1 action, 1 buy, and scaled supply', () => {
  const state = newGame({ mode: 'solo', seats: 3, expansion: false });
  assert.equal(state.schema, 2);
  assert.equal(state.players.length, 3);
  assert.equal(state.turn.actionsLeft, 1);
  assert.equal(state.turn.buys, 1);
  assert.equal(state.supply.scout, 24);
  assert.equal(state.supply.crown, 48);

  for (const player of state.players) {
    assert.equal(player.hand.length, 5);
    assert.equal(player.deck.length, 5);
    const all = [...player.hand, ...player.deck].sort();
    assert.deepEqual(all, [
      'copper','copper','copper','copper','copper','copper','copper','copper','merchant','scout'
    ]);
  }
});

test('action budget blocks terminal chains while keeping treasures and builds usable', () => {
  const state = newGame({ mode: 'local', seats: 2 });
  const player = current(state);
  player.hand = ['salvager', 'saboteur', 'merchant', 'copper', 'copper'];
  player.deck = ['copper'];

  assert.equal(playIssue(state, 0), '');
  assert.equal(play(state, 0), true);
  assert.equal(state.turn.actionsLeft, 0);
  assert.equal(state.turn.actions, 1);
  assert.equal(playIssue(state, 0), 'No actions left');
  assert.equal(play(state, 0, 1), false);

  // Treasures are free even at 0 actionsLeft
  assert.equal(playIssue(state, 1), '');
  assert.equal(play(state, 1), true);
  assert.equal(state.turn.coins, 3);

  // Building an asset works without an action
  assert.equal(build(state, 1), true);
  assert.equal(player.assets.length, 1);
  assert.equal(state.turn.coins, 1);
});

test('architect and scout chain actions into artificer and salvager combo', () => {
  const state = newGame({ mode: 'local', seats: 2 });
  const player = current(state);
  player.hand = ['architect', 'scout', 'salvager', 'artificer'];
  player.deck = ['copper', 'guildhall', 'copper'];

  // Architect: +1 card (copper), +2 actions -> actionsLeft = 2, actions = 1
  assert.equal(play(state, 0), true);
  assert.equal(state.turn.actionsLeft, 2);
  assert.equal(state.turn.coins, 1);

  // Scout: draws guildhall & copper, +1 action -> actionsLeft = 2, discards lowest (copper)
  assert.equal(play(state, 0), true);
  assert.equal(state.turn.actionsLeft, 2);
  assert.equal(player.discard.at(-1), 'copper');

  // Salvager: recovers discarded copper (+0 actions) -> actionsLeft = 1, actions = 3
  assert.equal(play(state, 0), true);
  assert.equal(state.turn.actionsLeft, 1);
  assert.equal(state.turn.coins, 2);

  // Artificer: 4th action -> +4 coins (total 6)
  assert.equal(play(state, 0), true);
  assert.equal(state.turn.actionsLeft, 0);
  assert.equal(state.turn.coins, 6);
});

test('sentinel blocks attacks and draws a replacement card', () => {
  const state = newGame({ mode: 'local', seats: 2 });
  const [attacker, defender] = state.players;
  attacker.hand = ['saboteur'];
  defender.hand = ['sentinel', 'copper'];
  defender.assets = [{ key: 'merchant', disabled: false }];
  defender.deck = ['scout'];

  assert.equal(play(state, 0, defender.id), true);
  assert.equal(defender.assets[0].disabled, false);
  assert.deepEqual(defender.hand, ['copper', 'scout']);
  assert.deepEqual(defender.discard, ['sentinel']);
});

test('overdrive grants 2 cards and 1 action on purchase', () => {
  const state = newGame({ mode: 'local', seats: 2, expansion: true });
  const player = current(state);
  player.hand = [];
  player.deck = ['architect', 'copper'];
  state.turn.coins = 5;
  state.turn.actionsLeft = 0;

  assert.equal(buy(state, 'overdrive'), true);
  assert.equal(player.assets[0].key, 'overdrive');
  assert.equal(player.hand.length, 2);
  assert.equal(state.turn.actionsLeft, 1);
});

test('reaching target prestige schedules final round and declares winner', () => {
  const state = newGame({ mode: 'solo', seats: 2 });
  const p1 = state.players[0];
  p1.prestige = TARGET_PRESTIGE - 6;
  state.turn.coins = 12;

  assert.equal(buy(state, 'crown'), true);
  assert.equal(p1.prestige, TARGET_PRESTIGE);
  assert.equal(state.finalRound, 2);

  endTurn(state); // P2 turn (round 1)
  cpuTurn(state); // P2 finishes round 1 -> enters round 2
  assert.equal(state.round, 2);
  assert.equal(state.winners, null);

  endTurn(state); // P1 finishes round 2
  cpuTurn(state); // P2 finishes round 2 -> game ends
  assert.deepEqual(state.winners, ['You']);
});

test('cpuStep and base 3-player pacing average around 50 rounds', () => {
  let totalRounds = 0;
  const games = 120;
  for (let g = 0; g < games; g++) {
    const state = newGame({ mode: 'solo', seats: 3, expansion: false });
    state.players[0].cpu = true;
    let guard = 0;
    while (!state.winners && guard++ < 2000) {
      cpuStep(state);
    }
    assert.ok(state.winners, 'Game should finish within guard steps');
    assert.ok(state.round <= MAX_ROUNDS, 'Game should not exceed MAX_ROUNDS');
    totalRounds += state.round;
  }
  const avgRounds = totalRounds / games;
  assert.ok(avgRounds >= 43 && avgRounds <= 58, `Expected ~50 avg rounds, got ${avgRounds.toFixed(2)}`);
});
