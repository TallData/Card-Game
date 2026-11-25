import { cards, market, victory, accelerants, newGame, current, rivals, play, buy, buyIssue, build, buildIssue, tax, endTurn, cpuTurn } from './engine.js';

const glyphs = { compass:'◈', coins:'♙', coin:'◉', anvil:'⚒︎', gem:'♢', swords:'⚔︎', eye:'◎', shield:'⛨', temple:'▤', flag:'⚑', castle:'♜', crown:'♔' };
const storageKey = 'guildfall.table.v1';
const accessKey = 'guildfall.accelerants';
const trialCode = 'GUILD15';
const byId = id => document.getElementById(id);
const panel = byId('panel');
const panelBody = byId('panel-body');
let handMode = 'play';
let saved;
let unlocked = false;
try {
  saved = JSON.parse(localStorage.getItem(storageKey));
  unlocked = localStorage.getItem(accessKey) === 'yes';
} catch {}
let game = saved?.schema === 1 ? saved : newGame();
let cpuTimer;

const guide = `
  <ol class="guide-list">
    <li><strong>Play your hand.</strong> Play as many cards as you like, in any order. Copper and Merchants make coins. Actions draw cards and create combinations.</li>
    <li><strong>Buy better cards.</strong> You have 2 buys each turn. Standard purchases enter your discard pile. In an Accelerants game, instant engines install directly into an asset slot and resolve their purchase effect immediately.</li>
    <li><strong>Build your engine.</strong> Spend 2 coins to turn an unplayed card into an asset. You get one manual build per turn and up to three unique assets. Instant engines need no extra coins and leave your manual build available. If you replace an asset, its card goes to your discard pile. Rebuilding skips the purchase effect.</li>
    <li><strong>Disrupt a rival.</strong> You can launch one attack per turn, shared between played attacks and Embargo purchases. A Sentinel in your opponent’s hand blocks it automatically. Disabled assets recover after that opponent’s next turn.</li>
    <li><strong>Accelerants expansion only.</strong> Unlock the separate deck with a trial code, then select it for a new game. One owning host enables it for everyone at the table. Foundry grants 2 coins and 1 buy on purchase, then 2 coins at each turn start. Overdrive draws 2 on purchase, then 1 on your first action each turn. Embargo attacks on purchase and adds 1 coin to rivals’ first purchase. Combined taxes cap at 2. A shield blocks the purchase attack. The asset still installs and applies its tax.</li>
    <li><strong>Claim the city.</strong> Victory cards give prestige and take space in your deck. Reaching 15 schedules one final round for everyone. The highest prestige wins, and tied players share victory. Round 25 is the limit.</li>
  </ol>
  <p class="combo"><strong>Try this combination.</strong> Play Scout to discard a card, recover it with Salvager, then play Artificer to score a coin for each action you’ve played.</p>
  <p class="panel-muted">Scouts discard the lowest-cost card automatically. Salvagers recover the highest-cost eligible card. Assets activate immediately unless their effect says “start your turn.”</p>
  <div class="dialog-actions"><button class="button primary" data-close>Back to the table</button></div>`;

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(game)); } catch {}
}

function icon(key) {
  return `<span class="glyph" aria-hidden="true">${glyphs[cards[key].icon]}</span>`;
}

function supplyCard(key) {
  const card = cards[key];
  const issue = current(game).cpu ? 'Rival turn' : buyIssue(game,key);
  return cardMarkup(key, {
    action:`data-buy="${key}"`,
    label:`${card.name}, ${card.cost + tax(game)} coins, ${issue || 'buy card'}`,
    footer:`${game.supply[key]} remaining`,
    hint:issue,
    disabled:!!issue,
    isMarket:true
  });
}

function cardMarkup(key, {action, label, footer, hint, disabled, isMarket=false, asset=false}) {
  const card = cards[key];
  return `<button class="card ${card.type.toLowerCase()} ${isMarket ? 'market' : ''}" ${action} aria-label="${label}" ${hint ? `title="${hint}"` : ''} ${disabled ? 'disabled' : ''}>
    <span class="card-top"><span>${asset ? 'Asset' : card.type}</span><span class="cost">${asset ? 2 : card.cost + (isMarket ? tax(game) : 0)}</span></span>
    <span class="stamp"><span class="stamp-ring">${icon(key)}</span></span>
    <span class="card-name">${card.name}</span>
    <span class="card-text">${asset ? card.asset || 'This card has no asset effect.' : card.text}</span>
    <span class="card-foot"><span>${footer}</span>${!disabled ? '<span aria-hidden="true">✦</span>' : ''}</span>
  </button>`;
}

function renderPlayer(player, active) {
  const title = player.cpu ? `CPU · ${player.title}` : player.title;
  const assets = player.assets.map(asset => cards[asset.key].name + (asset.disabled ? ' (disabled)' : '')).join(', ') || 'No assets established';
  return `<article class="player ${active ? 'active' : ''}" ${active ? 'aria-current="true"' : ''}>
    <span class="avatar" aria-hidden="true">${player.cpu ? ['','♞','♜','♝','♛'][player.id] : '♔'}</span>
    <div class="player-info"><div class="player-name">${player.name}${active ? '<small>Playing</small>' : ''}</div><span class="player-meta">${title}</span><span class="player-assets">${assets}</span></div>
    <div class="player-score"><strong>${player.prestige}</strong><small>/ 15 ♔</small></div>
  </article>`;
}

function render() {
  const player = current(game);
  const turn = game.turn;
  const locked = Boolean(game.winners || game.passing || player.cpu);
  byId('table-type').textContent = game.mode === 'solo' ? 'Solo table' : 'Pass-and-play table';
  byId('deck-label').textContent = game.expansion ? 'ACCELERANTS' : 'BASE DECK';
  byId('round').textContent = String(game.round).padStart(2, '0');
  byId('round-limit').textContent = game.finalRound ? `/ ${game.finalRound} FINAL` : '/ 25 MAX';
  const players = byId('players');
  players.style.setProperty('--seats',game.players.length);
  players.innerHTML = game.players.map(entry => renderPlayer(entry,entry === player && !game.winners)).join('');
  const notice = byId('game-notice');
  notice.hidden = !(game.winners || game.finalRound);
  if (game.winners) {
    const winners = game.winners.map(name => name === 'You' ? 'You' : name).join(' and ');
    const top = Math.max(...game.players.map(entry => entry.prestige));
    notice.innerHTML = `<strong>${winners} ${game.winners.length > 1 ? 'share victory' : 'claimed the city'} with ${top} prestige.</strong> &ensp; <button class="text-button" data-open="room">Start a new game</button>`;
  } else if (game.finalRound) notice.textContent = game.round === game.finalRound ? 'The final round is underway.' : `The city will be decided in round ${game.finalRound}.`;
  byId('market').innerHTML = market.map(supplyCard).join('');
  byId('expansion-market').hidden = !game.expansion;
  byId('expansion-cards').innerHTML = game.expansion ? accelerants.map(supplyCard).join('') : '';
  byId('victory').innerHTML = victory.map(key => {
    const card = cards[key];
    const issue = current(game).cpu ? 'Rival turn' : buyIssue(game,key);
    return `<button class="victory-card" data-buy="${key}" title="${issue || 'Buy for ' + (card.cost + tax(game)) + ' coins'}" ${issue ? 'disabled' : ''}>${icon(key)}
      <span><strong>${card.name}</strong><small>+${card.points} prestige · ${game.supply[key]} left</small></span><span class="victory-cost" aria-label="${card.cost + tax(game)} coins">${card.cost + tax(game)}</span></button>`;
  }).join('');
  byId('market-note').textContent = tax(game) ? `Embargo adds ${tax(game)} coin${tax(game) === 1 ? '' : 's'} to your first purchase` : 'Standard purchases go to your discard pile';
  byId('engine-count').textContent = `${player.assets.length} / 3 slots · Unique assets`;
  byId('assets').innerHTML = Array.from({length:3},(_, index) => {
    const asset = player.assets[index];
    return asset ? `<button class="asset-slot filled ${asset.disabled ? 'disabled' : ''}" data-asset="${asset.key}">${icon(asset.key)}<span><strong>${cards[asset.key].name}</strong><small>${asset.disabled ? 'Disabled this turn' : cards[asset.key].asset}</small></span></button>` :
      `<button class="asset-slot" data-mode="build" ${locked ? 'disabled' : ''}>＋ &nbsp; Establish an asset</button>`;
  }).join('');
  byId('hand-title').textContent = game.mode === 'local' ? `${player.name}’s hand` : 'Your hand';
  const showHand = !player.cpu && !game.passing && !game.winners;
  byId('hand-count').textContent = showHand ? `${player.hand.length} card${player.hand.length === 1 ? '' : 's'}` : '';
  byId('hand-note').textContent = handMode === 'build' ? 'Choose an unplayed card to build it for 2 coins.' : 'Play cards in any order. Save Artificer until after your other actions.';
  byId('hand-cards').innerHTML = showHand ? player.hand.map((key,index) => {
    const building = handMode === 'build';
    const issue = building ? buildIssue(game,key) : cards[key].points ? 'Scores prestige' : '';
    const spent = cards[key].type === 'Attack' && turn.attack;
    const action = building ? 'Build' : spent ? 'Play for 2 coins' : 'Play card';
    return cardMarkup(key, {action:`data-hand="${index}"`, label:`${cards[key].name}, ${issue || action}`, footer:issue || action, disabled:!!issue, asset:building});
  }).join('') || '<p class="empty">Your hand is empty.</p>' : '';
  document.querySelectorAll('.segmented [data-mode]').forEach(button => {
    button.setAttribute('aria-pressed',String(button.dataset.mode === handMode));
    button.disabled = locked;
  });
  byId('hand-stats').innerHTML = showHand ? `<span>Deck <strong>${player.deck.length}</strong></span><span>Discard <strong>${player.discard.length}</strong></span><span>Played <strong>${player.played.length}</strong></span><span>Actions chained <strong>${turn.actions}</strong></span>` : '';
  byId('turn-title').textContent = game.winners ? 'Game over' : game.passing ? 'Pass the table' : player.cpu ? `${player.name}’s turn` : game.mode === 'local' ? `${player.name}’s turn` : 'Your turn';
  byId('coins').textContent = turn.coins;
  byId('buys').textContent = turn.buys;
  byId('attack-status').innerHTML = `<b aria-hidden="true">⚔︎</b>${turn.attack ? 'Attack used' : '1 attack available'}`;
  byId('build-status').innerHTML = `<b aria-hidden="true">♜</b>${turn.built ? 'Build used' : '1 build available'}`;
  byId('tax-status').hidden = !tax(game);
  byId('tax-status').textContent = tax(game) ? `First purchase tax +${tax(game)}` : '';
  byId('end-turn').disabled = Boolean(game.winners || player.cpu);
  byId('end-turn').textContent = game.passing ? 'Reveal hand' : 'End turn';
  byId('quick-counters').textContent = `${turn.coins} coins · ${turn.buys} buys`;
  byId('quick-end').disabled = byId('end-turn').disabled;
  byId('quick-end').textContent = byId('end-turn').textContent;
  byId('chronicle').innerHTML = game.log.slice(0,14).map(entry => `<li>${entry.message}</li>`).join('');
  save();
}

function showPanel(kicker,title,html,mandatory=false) {
  byId('panel-kicker').textContent = kicker;
  byId('panel-title').textContent = title;
  panelBody.innerHTML = html;
  byId('close-panel').hidden = mandatory;
  panel.dataset.mandatory = String(mandatory);
  if (!panel.open) panel.showModal();
  else panelBody.querySelector('button, input, select')?.focus();
  panel.scrollTop = 0;
}

function libraryMarkup(keys, assetsOnly=false) {
  return `<div class="library-list">${keys.map(key => {
    const card = cards[key];
    return `<article class="library-entry"><div class="title-row">${icon(key)}<h3>${card.name}</h3><span>${card.type} · ${card.cost} coins</span></div>
      ${assetsOnly ? '' : `<p>${card.text}</p>`}${card.asset ? `<small>${card.asset}</small>` : ''}</article>`;
  }).join('')}</div>`;
}

function openRoom() {
  showPanel('SET YOUR TABLE','Game room',`
    <p class="panel-muted">Play against computer rivals or share this device with friends. Your current game is saved on this device. Starting a new game replaces it.</p>
    <form id="room-form" class="room-form">
      <label>Game mode <select name="mode"><option value="solo" ${game.mode === 'solo' ? 'selected' : ''}>Solo · Computer rivals</option><option value="local" ${game.mode === 'local' ? 'selected' : ''}>Pass-and-play · Same device</option></select></label>
      <label>Players <select name="seats">${[2,3,4,5].map(n => `<option ${n === game.players.length ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${unlocked ? `<label class="check"><input type="checkbox" name="expansion" ${game.expansion ? 'checked' : ''}> Include Accelerants expansion</label>` : '<button class="text-button" type="button" data-open="expansion">Unlock Accelerants</button>'}
      <div class="dialog-actions"><button class="button primary" type="submit">Start new game</button><button class="button outlined" type="button" data-close>Back to the table</button></div>
    </form>`);
}

function openExpansion() {
  showPanel('OPTIONAL DECK','Accelerants',`
    <p class="panel-muted">Install these cards straight into your engine. One host unlocks the deck for everyone at the table.</p>
    ${libraryMarkup(accelerants)}
    ${unlocked ? '<p class="panel-muted">Accelerants is unlocked on this device. Select it in the Game room when setting up a new game.</p><div class="dialog-actions"><button class="button primary" data-open="room">Open Game room</button></div>' :
      `<form id="unlock-form" class="room-form"><label>Trial code<input name="code" type="text" autocomplete="off" required></label><p class="panel-muted">For this edition, use trial code <strong>${trialCode}</strong>.</p><div id="code-error" role="alert" hidden>That code didn’t match. Try again.</div><div class="dialog-actions"><button class="button primary" type="submit">Unlock expansion</button><button class="button outlined" type="button" data-open="room">Back to Game room</button></div></form>`}
  `);
}

function open(name) {
  if (name === 'guide') showPanel('A QUICK FIELD GUIDE','Build. Scheme. Reign.',guide);
  if (name === 'room') openRoom();
  if (name === 'expansion') openExpansion();
  if (name === 'library') showPanel('CARDS & EFFECTS','Deck library',`${libraryMarkup(['copper',...market,...victory])}<div class="dialog-actions"><button class="button outlined" data-open="expansion">Explore Accelerants</button><button class="button primary" data-close>Back to the table</button></div>`);
  if (name === 'assets') showPanel('PERMANENT ASSETS','Engine guide',`<p class="panel-muted">An active asset starts working as soon as it’s installed. A start-of-turn effect begins on your next turn. Replaced assets go to your discard pile.</p>${libraryMarkup(['copper',...market,...(game.expansion ? accelerants : [])],true)}`);
}

function update(message) {
  render();
  byId('announcement').textContent = message || `${game.turn.coins} coins. ${game.turn.buys} buys left.`;
}

function chooseRival(done) {
  const options = rivals(game);
  if (options.length === 1) { done(options[0].id); return; }
  showPanel('DISRUPT A RIVAL','Choose your target',`<div class="option-stack">${options.map(rival => `<button class="button outlined" data-target="${rival.id}">${rival.name} · ${rival.prestige} prestige · ${rival.assets.length} assets</button>`).join('')}</div>`);
  panelBody.querySelectorAll('[data-target]').forEach(button => button.addEventListener('click', () => {
    panel.close();
    done(Number(button.dataset.target));
  }));
}

function chooseSlot(key, done) {
  if (current(game).assets.length < 3) { done(undefined); return; }
  showPanel('THREE ASSET SLOTS','Replace an asset',`<p class="panel-muted">Choose an asset to discard and make room for ${cards[key].name}.</p><div class="option-stack">${current(game).assets.map((asset,index) => `<button class="button outlined" data-slot="${index}">Replace ${cards[asset.key].name}</button>`).join('')}</div>`);
  panelBody.querySelectorAll('[data-slot]').forEach(button => button.addEventListener('click', () => {
    panel.close();
    done(Number(button.dataset.slot));
  }));
}

function showPass() {
  showPanel('PASS THE TABLE', `Give the device to ${current(game).name}`, '<p class="panel-muted">Reveal your hand once you have the device.</p><div class="dialog-actions"><button class="button primary" data-reveal>Reveal my hand</button></div>',true);
}

function driveTable() {
  clearTimeout(cpuTimer);
  if (game.winners) {
    byId('game-notice').scrollIntoView({block:'nearest'});
    return;
  }
  if (game.passing) { showPass(); return; }
  if (current(game).cpu) {
    cpuTimer = setTimeout(() => {
      cpuTurn(game);
      update();
      driveTable();
    },440);
  }
}

function endPlayerTurn() {
  if (game.passing) { showPass(); return; }
  if (current(game).cpu || !endTurn(game)) return;
  handMode = 'play';
  update();
  driveTable();
}

panel.addEventListener('cancel', event => {
  if (panel.dataset.mandatory === 'true') event.preventDefault();
});

document.addEventListener('click',event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const data = button.dataset;
  if (button.id === 'close-panel' || 'close' in data) panel.close();
  if (['end-turn','quick-end'].includes(button.id)) endPlayerTurn();
  if (data.open) open(data.open);
  if ('reveal' in data) {
    game.passing = false;
    panel.close();
    update(`${current(game).name}, your hand is ready.`);
    byId('hand').scrollIntoView({block:'start'});
  }
  if (data.asset) {
    const card = cards[data.asset];
    showPanel('PERMANENT ASSET',card.name,`<p>${card.asset}</p><div class="dialog-actions"><button class="button primary" data-close>Back to the table</button></div>`);
  }
  if (data.mode) {
    handMode = data.mode;
    update();
    if (button.classList.contains('asset-slot')) {
      byId('hand').scrollIntoView({block:'start'});
      document.querySelector('.segmented [data-mode="build"]').focus({preventScroll:true});
    }
  }
  if (current(game).cpu || game.passing || game.winners) return;
  if (data.buy) {
    const key = data.buy;
    const commit = (slot,targetId) => {
      if (buy(game,key,{slot,targetId})) update(`${cards[key].name} purchased. ${game.turn.coins} coins left.`);
    };
    if (accelerants.includes(key)) chooseSlot(key, slot => {
      if (key === 'embargo') chooseRival(targetId => commit(slot,targetId));
      else commit(slot);
    });
    else commit();
  }
  if ('hand' in data) {
    const index = Number(data.hand);
    const key = current(game).hand[index];
    const commit = targetId => {
      if (play(game,index,targetId)) {
        update(`${cards[key].name} played. ${game.turn.coins} coins.`);
        if (event.detail === 0) (byId('hand-cards').querySelector('button:not(:disabled)') ?? byId('end-turn')).focus({preventScroll:true});
      }
    };
    if (handMode === 'build') chooseSlot(key, slot => {
      if (build(game,index,slot)) update(`${cards[key].name} built. ${game.turn.coins} coins left.`);
    });
    else if (cards[key].type === 'Attack' && !game.turn.attack) chooseRival(commit);
    else commit();
  }
});

document.addEventListener('submit', event => {
  const form = event.target;
  if (form.id === 'room-form') {
    event.preventDefault();
    const values = new FormData(form);
    game = newGame({mode:values.get('mode'), seats:Number(values.get('seats')), expansion:unlocked && values.has('expansion')});
    handMode = 'play';
    panel.close();
    update('A new game has started.');
    driveTable();
    window.scrollTo({top:0});
  }
  if (form.id === 'unlock-form') {
    event.preventDefault();
    if (String(new FormData(form).get('code')).trim().toUpperCase() !== trialCode) {
      byId('code-error').hidden = false;
      return;
    }
    unlocked = true;
    try { localStorage.setItem(accessKey,'yes'); } catch {}
    openExpansion();
  }
});

update();
driveTable();
