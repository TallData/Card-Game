export const TARGET_PRESTIGE = 85;
export const MAX_ROUNDS = 90;

export const cards = {
  scout:      { name:'Scout',      type:'Action',   cost:3, icon:'compass', actions:1, text:'Draw 2 cards. +1 action. Discard your lowest-cost card.', asset:'Draw 1 extra card at the end of your turn.' },
  merchant:   { name:'Merchant',   type:'Treasure', cost:3, icon:'coins', text:'Gain 2 coins.', asset:'Gain 1 coin at the start of every turn.' },
  salvager:   { name:'Salvager',   type:'Action',   cost:4, icon:'anvil', actions:0, text:'Recover the highest-cost card discarded this turn. Gain 1 coin.', asset:'Gain 1 coin the first time you discard a card during your turn.' },
  artificer:  { name:'Artificer',  type:'Action',   cost:5, icon:'gem', actions:0, text:'Gain 1 coin per other action played this turn, plus 1.', asset:'Gain 1 coin when you play your third action each turn.' },
  saboteur:   { name:'Saboteur',   type:'Attack',   cost:4, icon:'swords', actions:0, text:'Gain 2 coins. Disable one rival asset for their next turn.', asset:'Gain 1 coin when you launch an attack.' },
  infiltrator:{ name:'Infiltrator',type:'Attack',   cost:4, icon:'eye', actions:0, text:'Gain 2 coins. A rival with 5+ cards discards their cheapest card.', asset:'Draw 1 card when you launch an attack.' },
  sentinel:   { name:'Sentinel',   type:'Action',   cost:3, icon:'shield', actions:1, text:'Draw 1 card. +1 action. Gain 1 coin. In hand, discard to block an attack and draw 1.', asset:'Gain 1 coin the first time you play an action on your turn.' },
  architect:  { name:'Architect',  type:'Action',   cost:5, icon:'temple', actions:2, text:'Draw 1 card. +2 actions. Gain 1 coin.', asset:'Gain 1 buy at the start of every turn.' },
  copper:     { name:'Copper',     type:'Treasure', cost:0, icon:'coin', text:'Gain 1 coin.', asset:'Gain 1 coin at the start of every turn.' },
  outpost:    { name:'Outpost',    type:'Victory',  cost:4, icon:'flag', points:1, text:'+1 prestige.' },
  guildhall:  { name:'Guildhall',  type:'Victory',  cost:8, icon:'castle', points:3, text:'+3 prestige.' },
  crown:      { name:'The Crown',  type:'Victory',  cost:12, icon:'crown', points:6, text:'+6 prestige.' },
  foundry:    { name:'Foundry',    type:'Accelerant', cost:6, icon:'anvil', text:'On purchase, gain 2 coins and 1 buy.', asset:'Gain 2 coins at the start of every turn.' },
  overdrive:  { name:'Overdrive',  type:'Accelerant', cost:5, icon:'gem', text:'On purchase, draw 2 cards and gain 1 action.', asset:'Draw 1 card on your first action each turn.' },
  embargo:    { name:'Embargo',    type:'Accelerant', cost:6, icon:'swords', text:'On purchase, attack a rival and disable one asset for their next turn.', asset:'Rivals pay 1 extra coin on their first purchase. Combined taxes cap at 2.' }
};

export const market = ['scout','merchant','salvager','artificer','saboteur','infiltrator','sentinel','architect'];
export const victory = ['outpost','guildhall','crown'];
export const accelerants = ['foundry','overdrive','embargo'];
export const current = state => state.players[state.active];
export const rivals = state => state.players.filter(player => player !== current(state));
const activeAsset = (player, key) => player.assets.some(asset => asset.key === key && !asset.disabled);
const isActionCard = key => ['Action','Attack'].includes(cards[key]?.type);

function shuffle(deck) {
  for (let index = deck.length - 1; index > 0; index--) {
    const next = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[next]] = [deck[next], deck[index]];
  }
  return deck;
}

function draw(player, count) {
  for (let index = 0; index < count; index++) {
    if (!player.deck.length) {
      player.deck = shuffle(player.discard.splice(0));
      player.recoverable = [];
    }
    if (!player.deck.length) break;
    player.hand.push(player.deck.pop());
  }
}

export function log(state, message) {
  state.log.unshift({ round:state.round, message });
  state.log = state.log.slice(0, 28);
}

export function newGame({mode='solo', seats=3, expansion=false}={}) {
  const names = mode === 'solo' ? ['You','Vesper','Aldric','Rowan','Isolde'] : ['Player 1','Player 2','Player 3','Player 4','Player 5'];
  const titles = ['Your guild','The schemer','The builder','The broker','The tactician'];
  const players = names.slice(0, seats).map((name, index) => {
    const starter = shuffle(['copper','copper','copper','copper','copper','copper','copper','copper','merchant','scout']);
    return {
      id:index, name, title:mode === 'solo' ? titles[index] : 'Human player', cpu:mode === 'solo' && index > 0,
      deck:starter.slice(5), hand:starter.slice(0,5), discard:[], recoverable:[], assets:[], played:[], prestige:0
    };
  });
  const supply = Object.fromEntries([
    ...market.map(key => [key, seats * 8]),
    ...victory.map(key => [key, seats * 16]),
    ...(expansion ? accelerants.map(key => [key, Math.max(8, seats * 4)]) : [])
  ]);
  const state = { schema:2, mode, players, expansion, supply, round:1, active:0, finalRound:null, winners:null, log:[], passing:false };
  log(state, `The gates are open. First to ${TARGET_PRESTIGE} prestige triggers the final round.`);
  begin(state);
  return state;
}

function begin(state) {
  const player = current(state);
  player.recoverable = [];
  state.turn = { coins:0, buys:1, actionsLeft:1, attack:false, built:false, buying:false, actions:0, purchases:0, salvagerUsed:false };
  for (const [key, coins] of [['merchant',1],['copper',1],['foundry',2]]) {
    if (activeAsset(player, key)) state.turn.coins += coins;
  }
  if (activeAsset(player, 'architect')) state.turn.buys++;
}

function low(hand) {
  return hand.reduce((best, key, index) => best < 0 || cards[key].cost < cards[hand[best]].cost ? index : best, -1);
}

function discardHand(state, player, index) {
  if (index < 0) return;
  const [key] = player.hand.splice(index, 1);
  player.recoverable.push(player.discard.length);
  player.discard.push(key);
  if (player === current(state) && !state.turn.salvagerUsed && activeAsset(player, 'salvager')) {
    state.turn.coins++;
    state.turn.salvagerUsed = true;
  }
  return key;
}

function recover(player) {
  const index = player.recoverable.reduce((best, candidate) => best < 0 || cards[player.discard[candidate]].cost > cards[player.discard[best]].cost ? candidate : best, -1);
  if (index < 0) return;
  const [key] = player.discard.splice(index, 1);
  player.recoverable = player.recoverable.filter(entry => entry !== index).map(entry => entry > index ? entry - 1 : entry);
  player.hand.push(key);
  return key;
}

function attack(state, key, target) {
  const turn = state.turn;
  const player = current(state);
  if (turn.attack || !target) return;
  turn.attack = true;
  if (activeAsset(player, 'saboteur')) turn.coins++;
  if (activeAsset(player, 'infiltrator')) draw(player, 1);
  const shield = target.hand.indexOf('sentinel');
  if (shield >= 0) {
    discardHand(state, target, shield);
    draw(target, 1);
    log(state, `${target.name} blocked ${cards[key].name} with Sentinel.`);
    return;
  }
  if (key === 'infiltrator') {
    if (target.hand.length >= 5) {
      const discarded = discardHand(state, target, low(target.hand));
      log(state, `${target.name} discarded ${cards[discarded].name}.`);
    } else log(state, `${target.name} had fewer than 5 cards.`);
    return;
  }
  const asset = target.assets.filter(entry => !entry.disabled).sort((a,b)=> cards[b.key].cost - cards[a.key].cost)[0];
  if (asset) {
    asset.disabled = true;
    log(state, `${target.name} lost access to ${cards[asset.key].name} for their next turn.`);
  } else log(state, `${target.name} had no active asset to disable.`);
}

function available(state) {
  return !state.winners && !state.passing;
}

export function playIssue(state, index) {
  if (!available(state)) return 'Wait for the current player';
  const key = current(state).hand[index];
  if (!key) return 'Unavailable';
  if (cards[key].points) return 'Scores prestige';
  if (isActionCard(key) && state.turn.actionsLeft <= 0) return 'No actions left';
  return '';
}

export function play(state, index, targetId) {
  const player = current(state);
  const target = rivals(state).find(rival => rival.id === targetId);
  const key = player.hand[index];
  if (playIssue(state, index)) return false;
  if (cards[key].type === 'Attack' && !state.turn.attack && !target) return false;
  const turn = state.turn;
  player.hand.splice(index,1);
  player.played.push(key);
  if (isActionCard(key)) {
    turn.actionsLeft--;
    turn.actions++;
    if (turn.actions === 1) {
      if (activeAsset(player, 'sentinel')) turn.coins++;
      if (activeAsset(player, 'overdrive')) draw(player,1);
    }
    if (turn.actions === 3 && activeAsset(player, 'artificer')) turn.coins++;
    turn.actionsLeft += cards[key].actions || 0;
  }
  switch (key) {
    case 'copper': turn.coins++; break;
    case 'merchant': turn.coins += 2; break;
    case 'scout': draw(player,2); discardHand(state,player,low(player.hand)); break;
    case 'salvager': {
      const recovered = recover(player);
      if (recovered) log(state, `${player.name} recovered ${cards[recovered].name}.`);
      turn.coins++;
      break;
    }
    case 'artificer': turn.coins += turn.actions; break;
    case 'sentinel': draw(player,1); turn.coins++; break;
    case 'architect': draw(player,1); turn.coins++; break;
    case 'infiltrator':
    case 'saboteur': turn.coins += 2; attack(state,key,target); break;
  }
  return true;
}

export function tax(state) {
  return state.turn.purchases ? 0 : Math.min(2, rivals(state).filter(player => activeAsset(player,'embargo')).length);
}

export function buyIssue(state, key) {
  if (!available(state)) return 'Wait for the current player';
  if (!state.supply[key]) return 'Sold out';
  if (!state.turn.buys) return 'No buys left';
  if (state.turn.coins < cards[key].cost + tax(state)) return 'Need more coins';
  if (accelerants.includes(key) && current(state).assets.some(asset => asset.key === key)) return 'Already installed';
  if (key === 'embargo' && state.turn.attack) return 'Attack already used';
  return '';
}

function install(player, key, slot) {
  if (player.assets.length === 3) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return false;
    player.discard.push(player.assets[slot].key);
    player.assets[slot] = { key, disabled:false };
  } else player.assets.push({ key, disabled:false });
  return true;
}

export function buy(state, key, {slot, targetId}={}) {
  const player = current(state);
  const turn = state.turn;
  const target = rivals(state).find(rival => rival.id === targetId);
  if (buyIssue(state,key) || (key === 'embargo' && !target)) return false;
  if (accelerants.includes(key)) {
    if (!install(player,key,slot)) return false;
  } else player.discard.push(key);
  turn.coins -= cards[key].cost + tax(state);
  turn.buys--;
  turn.purchases++;
  state.supply[key]--;
  log(state, `${player.name} ${accelerants.includes(key) ? 'installed' : 'bought'} ${cards[key].name}.`);
  if (key === 'foundry') { turn.coins += 2; turn.buys++; }
  if (key === 'overdrive') { draw(player,2); turn.actionsLeft++; }
  if (key === 'embargo') attack(state,key,target);
  if (cards[key].points) {
    player.prestige += cards[key].points;
    if (player.prestige >= TARGET_PRESTIGE && !state.finalRound) {
      state.finalRound = Math.min(MAX_ROUNDS, state.round + 1);
      log(state, `${player.name} reached ${TARGET_PRESTIGE} prestige. Round ${state.finalRound} will decide the city.`);
    }
  }
  return true;
}

export function buildIssue(state, key) {
  if (!available(state)) return 'Wait for the current player';
  if (!cards[key]?.asset) return 'This card has no asset effect';
  if (state.turn.built) return 'Build already used';
  if (state.turn.coins < 2) return 'Building costs 2 coins';
  if (current(state).assets.some(asset => asset.key === key)) return 'Already installed';
  return '';
}

export function build(state, index, slot) {
  const player = current(state);
  const key = player.hand[index];
  if (buildIssue(state,key) || !install(player,key,slot)) return false;
  player.hand.splice(index,1);
  state.turn.coins -= 2;
  state.turn.built = true;
  log(state, `${player.name} built ${cards[key].name} for 2 coins.`);
  return true;
}

export function endTurn(state) {
  if (!available(state)) return false;
  const player = current(state);
  player.discard.push(...player.hand.splice(0), ...player.played.splice(0));
  draw(player, activeAsset(player,'scout') ? 6 : 5);
  player.assets.forEach(asset => { asset.disabled = false; });
  state.active++;
  if (state.active === state.players.length) {
    if (state.round >= (state.finalRound ?? MAX_ROUNDS)) {
      const top = Math.max(...state.players.map(entry => entry.prestige));
      state.winners = state.players.filter(entry => entry.prestige === top).map(entry => entry.name);
      state.active--;
      log(state, `${state.winners.join(' and ')} ${state.winners.length > 1 ? 'share victory' : 'claimed the city'} with ${top} prestige.`);
      return true;
    }
    state.round++;
    state.active = 0;
  }
  state.passing = state.mode === 'local';
  begin(state);
  return true;
}

const cpuPriorities = ['architect','scout','sentinel','copper','merchant','salvager','infiltrator','saboteur','artificer'];

export function cpuStep(state) {
  const player = current(state);
  if (!available(state) || !player?.cpu) return { done:true, kind:'idle' };
  const target = [...rivals(state)].sort((a,b)=> b.prestige-a.prestige || b.assets.length-a.assets.length)[0];
  if (!state.turn.buying) {
    const buildKey = ['merchant','architect','sentinel','copper'].find(key => player.hand.includes(key) && !buildIssue(state,key));
    if (buildKey && player.assets.length < 3 && state.round < 16 && (player.id !== 1 || state.round > 2)) {
      build(state, player.hand.indexOf(buildKey));
      return { done:false, kind:'build', card:buildKey };
    }
    const playKey = cpuPriorities.find(entry => {
      const index = player.hand.indexOf(entry);
      return index >= 0 && !playIssue(state, index);
    });
    if (playKey) {
      play(state, player.hand.indexOf(playKey), target?.id);
      return { done:false, kind:'play', card:playKey };
    }
    state.turn.buying = true;
  }
  const style = player.id === 1 ? ['saboteur','infiltrator','artificer'] : ['architect','artificer','sentinel'];
  const buys = state.round < 15 ? ['foundry','overdrive','architect','merchant','scout','embargo',...style,'outpost'] :
    ['crown','guildhall','outpost','foundry','overdrive','embargo',...style,'merchant','scout'];
  const buyKey = buys.find(entry => !buyIssue(state,entry));
  if (buyKey && buy(state, buyKey, { targetId:target?.id, slot:player.assets.length === 3 ? 0 : undefined })) {
    if (buyKey === 'overdrive') state.turn.buying = false;
    return { done:false, kind:'buy', card:buyKey };
  }
  endTurn(state);
  return { done:true, kind:'end' };
}

export function cpuTurn(state) {
  for (let step = 0; step < 64; step++) {
    if (cpuStep(state).done) break;
  }
}
