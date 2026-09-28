// Card-deck screen: King's Cup (52 playing cards) and the themed prompt decks.
import { $, esc, avatarHTML, buzz } from './util.js';
import { RULES, RED, FOURTH_KING, wordRule } from './kings.js';
import { KINDS } from './themes.js';
import { Sound } from './sound.js';
import { confetti } from './confetti.js';

export function createDeckUI({ me, floatReaction }) {
  let ruleKey = null;

  function render(s, prev) {
    const myId = me();
    const byId = (id) => s.players.find((p) => p.id === id);
    const turnP = s.players[s.turn];
    const myTurn = s.phase === 'playing' && turnP?.id === myId;
    const kings = s.theme === 'kings-cup';

    $('#gameCode').textContent = '#' + s.code;
    $('#deckLeft').textContent = s.deckLeft;
    $('#kingsCount').textContent = s.kings;
    $('#cupFill').style.height = (s.kings / 4) * 100 + '%';
    $('#gameTheme').textContent = kings ? '' : `${s.themeName}`;

    const mateOf = (id) => s.mates.filter((m) => m.includes(id)).length;
    $('#playerRail').innerHTML = s.players.map((p, i) => `
      <div class="rail-player ${i === s.turn && s.phase === 'playing' ? 'turn' : ''} ${p.online ? '' : 'offline'}" data-id="${esc(p.id)}">
        <div class="badges">${p.id === s.hostId ? '<span title="Host">🏠</span>' : ''}${s.qm === p.id ? '<span title="Question Master">❓</span>' : ''}${mateOf(p.id) ? '<span title="Has a mate">🤝</span>' : ''}${s.keepsakeBy?.includes(p.id) ? '<span title="Left a keepsake note">💌</span>' : ''}</div>
        ${avatarHTML(p)}<span class="pname">${p.id === myId ? 'You' : esc(p.name)}</span>
      </div>`).join('');
    const turnEl = $('.rail-player.turn');
    if (turnEl && (!prev || prev.turn !== s.turn)) turnEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

    const banner = $('#turnBanner'); const deck = $('#deck');
    if (s.phase === 'over') { banner.className = 'turn-banner'; banner.innerHTML = '🏁 Game over!'; }
    else if (myTurn) { banner.className = 'turn-banner mine'; banner.innerHTML = '⭐ YOUR TURN! ⭐'; }
    else if (turnP) { banner.className = 'turn-banner'; banner.innerHTML = `${avatarHTML(turnP)}<span><b>${esc(turnP.name)}</b> is up${turnP.online ? '' : ' (offline)'}…</span>`; }
    deck.disabled = !myTurn;
    deck.classList.toggle('ready', myTurn);
    deck.classList.toggle('empty', s.deckLeft === 0);
    $('#deckLabel').textContent = myTurn ? 'TAP TO DRAW!' : `${s.deckLeft} LEFT`;

    const wasMyTurn = prev && prev.phase === 'playing' && prev.players[prev.turn]?.id === myId;
    if (myTurn && !wasMyTurn) { Sound.turn(); buzz([80, 60, 80]); if (prev) confetti(40); }

    const c = s.card;
    if (c && (!prev || !prev.card || prev.card.seq !== c.seq)) reveal(c, !!prev && prev.seq !== s.seq, s);
    else if (!c) reset();
    if (kings) renderRule(s, c, byId); else renderPrompt(s, c, byId);

    const newest = prev && prev.seq !== s.seq;
    $('#history').innerHTML = s.history.map((h, i) => (h.rank
      ? `<div class="mini ${RED.has(h.suit) ? 'red' : ''} ${newest && i === 0 ? 'new' : ''}"><span>${esc(h.rank)}</span><span>${esc(h.suit)}</span>${avatarHTML(byId(h.by), 'who')}</div>`
      : `<div class="mini themed ${newest && i === 0 ? 'new' : ''}"><span>${(KINDS[h.kind] || KINDS.custom).emoji}</span>${avatarHTML(byId(h.by), 'who')}</div>`)).join('')
      || '<span class="muted small pad">Drawn cards will show up here</span>';

    if (kings) {
      const rows = [];
      if (s.qm) { const q = byId(s.qm); if (q) rows.push(`<div class="row">❓ ${avatarHTML(q)} <span><b>${esc(q.name)}</b> is Question Master</span></div>`); }
      s.mates.forEach(([a, b]) => { const pa = byId(a); const pb = byId(b); if (pa && pb) rows.push(`<div class="row">🤝 ${avatarHTML(pa)}${avatarHTML(pb)} <span><b>${esc(pa.name)}</b> &amp; <b>${esc(pb.name)}</b> are mates</span></div>`); });
      s.rules.forEach((r) => { const p = byId(r.by); rows.push(`<div class="row">👑 ${avatarHTML(p)} <span>${esc(r.text)}</span></div>`); });
      $('#houseCount').textContent = rows.length;
      $('#houseBody').innerHTML = rows.join('') || '<div class="empty">No house rules yet. Draw a King to make one!</div>';
    }
  }

  function popRule(fresh) { const card = $('#ruleCard'); if (fresh) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); } }

  function renderPrompt(s, c, byId) {
    if (!c) { idleRule(); return; }
    const key = 'p' + c.seq; if (ruleKey === key) return;
    ruleKey = key;
    const kind = KINDS[c.kind] || KINDS.custom; const drawer = byId(c.by);
    $('#ruleBy').innerHTML = drawer ? `${avatarHTML(drawer)} <span>${c.by === me() ? 'You' : esc(drawer.name)} drew</span>` : '';
    $('#ruleName').textContent = `${kind.emoji} ${c.label || kind.label}`;
    $('#ruleDesc').textContent = c.text;
    $('#ruleAction').innerHTML = c.by === me() ? '<div class="hint">Read it out loud! 📣</div>' : '';
    popRule(true);
  }

  function idleRule() {
    $('#ruleBy').innerHTML = '';
    $('#ruleName').textContent = 'Ready?';
    $('#ruleDesc').textContent = 'Whoever\'s turn it is — tap the deck to draw the first card!';
    $('#ruleAction').innerHTML = '';
  }

  function renderRule(s, c, byId) {
    if (!c) { idleRule(); return; }
    const rule = RULES[c.rank]; const drawer = byId(c.by); const mine = c.by === me();
    const key = c.seq + '|' + (c.pick || '') + '|' + (c.category || '') + '|' + (c.rule || '') + '|' + s.gentle + '|' + s.players.length;
    if (ruleKey === key) return;
    const fresh = !ruleKey || ruleKey.split('|')[0] !== String(c.seq);
    ruleKey = key;
    $('#ruleBy').innerHTML = drawer ? `${avatarHTML(drawer)} <span>${mine ? 'You' : esc(drawer.name)} drew ${esc(c.rank)}${esc(c.suit)}</span>` : '';
    $('#ruleName').textContent = `${rule.emoji} ${rule.name}`;
    let desc = rule.desc;
    if (c.rank === 'K' && c.king === 4) desc = FOURTH_KING; else if (c.rank === 'K') desc += ` (${c.king}/4 Kings)`;
    $('#ruleDesc').textContent = wordRule(desc, s.gentle);
    let html = '';
    const others = s.players.filter((p) => p.id !== c.by);
    if (rule.pick) {
      const picked = byId(c.pick);
      if (picked) html = `<div class="result">${c.rank === '8' ? '🤝' : '👉'} ${avatarHTML(picked)} ${esc(picked.name)}${c.rank === '8' ? ' is the mate!' : ' sips!'}</div>`;
      else if (mine && others.length) html = `<div class="hint">${rule.pick}</div><div class="chips">${others.map((p) => `<button class="person" data-pick="${esc(p.id)}">${avatarHTML(p)} ${esc(p.name)}</button>`).join('')}</div>`;
      else if (drawer && others.length) html = `<div class="hint">${esc(drawer.name)} is choosing…</div>`;
    } else if (rule.category) {
      if (c.category) html = `<div class="result">🗂️ ${esc(c.category)}</div>`;
      else if (mine) html = `<div class="hint">Pick a category</div><div class="chips">${(c.choices || []).map((t) => `<button data-cat="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <form class="action-row" data-form="category"><input class="input" maxlength="60" placeholder="…or type your own" /><button class="btn btn-pink">Go</button></form>`;
      else html = `<div class="hint">${esc(drawer?.name || 'They')} is picking a category…</div>`;
    } else if (rule.rule) {
      if (c.rule) html = `<div class="result">📜 New rule: ${esc(c.rule)}</div>`;
      else if (mine && c.king < 4) html = `<div class="hint">Make a rule for everyone</div><div class="chips">${(c.choices || []).map((t) => `<button data-rule="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <form class="action-row" data-form="rule"><input class="input" maxlength="90" placeholder="…or write your own rule" /><button class="btn btn-pink">Add</button></form>`;
      else if (c.king < 4) html = `<div class="hint">${esc(drawer?.name || 'They')} is making a new rule…</div>`;
    }
    $('#ruleAction').innerHTML = html;
    popRule(fresh);
  }

  function reveal(c, animate, s) {
    const face = $('#cardFace');
    const themed = !c.rank;
    face.classList.toggle('themed', themed);
    if (themed) {
      const kind = KINDS[c.kind] || KINDS.custom;
      $('#tcEmoji').textContent = kind.emoji; $('#tcKind').textContent = c.label || kind.label;
      face.classList.remove('red', 'king');
    } else {
      $('#cRank1').textContent = $('#cRank2').textContent = c.rank;
      $('#cSuit1').textContent = $('#cSuit2').textContent = $('#cSuitBig').textContent = c.suit;
      $('#cEmoji').textContent = RULES[c.rank].emoji;
      face.classList.toggle('red', RED.has(c.suit));
      face.classList.toggle('king', c.rank === 'K');
    }
    $('#cardWrap').classList.remove('idle');
    const inner = $('#cardInner');
    if (!animate) { inner.classList.add('shown'); return; }
    inner.classList.remove('shown', 'dealing'); void inner.offsetWidth;
    inner.classList.add('dealing');
    Sound.draw(); buzz(30);
    setTimeout(() => {
      inner.classList.remove('dealing'); inner.classList.add('shown');
      if (c.rank === 'K') {
        Sound.king(); buzz([100, 50, 200]);
        confetti(c.king === 4 ? 260 : 140, ['👑']);
        document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake');
      } else if (c.by === me()) confetti(30);
    }, 450);
    const drawer = s.players.find((p) => p.id === c.by);
    if (drawer && c.by !== me()) floatReaction(themed ? (KINDS[c.kind] || KINDS.custom).emoji : RULES[c.rank].emoji, drawer);
  }

  function reset() { $('#cardInner').classList.remove('shown', 'dealing'); $('#cardWrap').classList.add('idle'); ruleKey = null; }

  return { render, reset };
}
