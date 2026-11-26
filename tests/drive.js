'use strict';
const assert = require('node:assert/strict');
const {j} = require('./helpers');

function status(w){
  return j(w, `({
    pot:S.pot|0,
    hand:S.hand|0,
    bust:(S.q&&S.q.length)||0,
    pend:!!S.pend,
    actor:!!(cur()&&!cur().fold&&cur().stack>0),
    live:S.pl.filter(p=>p.stack>0).length,
    only:!!onlyBlinds(),
    showdown:S.pot>0 && !(cur()&&!cur().fold&&cur().stack>0) && !(S.q&&S.q.length) && !S.pend && (canAct().length<2 || done())
  })`);
}

function check(w){
  const s = j(w, `({
    issued:S.issued|0,
    pot:S.pot|0,
    pl:S.pl.map(p=>({id:p.id,stack:p.stack|0,bet:p.bet|0,inn:p.in|0,fold:p.fold?1:0})),
    pots:pots().map(r=>({amt:r.amt|0,el:r.el.slice()}))
  })`);
  const stacks = s.pl.reduce((a, p) => a + p.stack, 0);
  const inn = s.pl.reduce((a, p) => a + p.inn, 0);
  assert.equal(stacks + s.pot, s.issued, 'stacks+pot issued ' + JSON.stringify(s));
  for(const p of s.pl){
    assert.ok(p.stack >= 0 && p.bet >= 0 && p.inn >= 0, 'negative ' + JSON.stringify(p));
  }
  assert.equal(inn, s.pot, 'sum in ' + JSON.stringify(s));
  assert.equal(s.pots.reduce((a, r) => a + r.amt, 0), s.pot, 'pots ' + JSON.stringify(s.pots));
  for(const r of s.pots){
    for(const id of r.el){
      const p = s.pl.find(x => x.id === id);
      assert.ok(p && !p.fold, 'eligible folded ' + id);
    }
  }
  return s;
}

function snapPos(w){
  return j(w, `(()=>{
    const n=S.pl.length;
    return {
      bbi:S.bbi|0,
      sbi:S.sbi|0,
      btn:n?S.pl[(S.dl%n+n)%n].id:0,
      ids:S.pl.map(p=>p.id),
      dealt:S.pl.filter(p=>(p.stack>0||(p.in||0)>0)&&!p.fold).map(p=>p.id)
    };
  })()`);
}

function assertBlinds(w){
  const b = j(w, `(()=>{
    const sb=S.pl.find(p=>p.id===S.sbi), bb=S.pl.find(p=>p.id===S.bbi);
    return {
      sb:S.sb|0, bb:S.bb|0, li:S.li|0, lv:S.lv,
      sbi:sb?{in:sb.in|0,stack:sb.stack|0}:null,
      bbi:bb?{in:bb.in|0,stack:bb.stack|0}:null,
      rest:S.pl.filter(p=>p.id!==S.sbi&&p.id!==S.bbi).every(p=>(p.in|0)===0)
    };
  })()`);
  assert.ok(b.sbi && b.bbi, 'blinds seated');
  assert.equal(b.sbi.in, Math.min(b.sbi.stack + b.sbi.in, b.sb), 'SB posted');
  assert.equal(b.bbi.in, Math.min(b.bbi.stack + b.bbi.in, b.bb), 'BB posted');
  assert.ok(b.sbi.in > 0 || b.sb === 0, 'SB amount');
  assert.ok(b.bbi.in > 0 || b.bb === 0, 'BB amount');
  assert.equal(b.rest, true, 'only blinds posted');
  if(Array.isArray(b.lv) && b.lv[b.li]){
    assert.equal(b.sb, b.lv[b.li][0] | 0, 'SB level');
    assert.equal(b.bb, b.lv[b.li][1] | 0, 'BB level');
  }
}

function assertRotation(prev, now){
  const ids = now.ids;
  const dealt = new Set(now.dealt);
  const i = ids.indexOf(prev.bbi);
  assert.ok(i >= 0, 'previous BB still seated');
  let exp = null;
  for(let k = 1; k <= ids.length; k++){
    const id = ids[(i + k) % ids.length];
    if(dealt.has(id)){ exp = id; break; }
  }
  assert.equal(now.bbi, exp, 'BB moved one dealt-in player from ' + prev.bbi);
  const seats = ids.filter(id => dealt.has(id));
  assert.ok(seats.length >= 2, 'dealt-in');
  if(seats.length === 2){
    const other = seats.find(id => id !== now.bbi);
    assert.equal(now.sbi, other, 'HU SB');
    assert.equal(now.btn, other, 'HU BTN');
  }else{
    const bi = ids.indexOf(now.bbi);
    let sb = null, btn = null;
    for(let k = 1; k <= ids.length; k++){
      const id = ids[(bi - k + ids.length * ids.length) % ids.length];
      if(!dealt.has(id)) continue;
      if(sb == null) sb = id;
      else{ btn = id; break; }
    }
    assert.equal(now.sbi, sb, 'SB');
    assert.equal(now.btn, btn, 'BTN');
  }
}

function note(w, box){
  check(w);
  const st = status(w);
  if(st.pot > 0 && st.only){
    const pos = snapPos(w);
    if(box.mark && st.hand !== box.mark.hand) assertRotation(box.mark.pos, pos);
    assertBlinds(w);
    box.mark = {hand: st.hand, pos};
  }
  return st;
}

function awardPick(w, picks){
  const ov = w.document.getElementById('ov');
  if(ov.hidden) w.eval('award()');
  picks.forEach((ids, i) => {
    ids.forEach(id => {
      const btn = w.document.querySelector('#ov button[data-i="' + i + '"][data-p="' + id + '"]');
      assert.ok(btn, 'winner button ' + i + ' ' + id);
      if(btn.getAttribute('aria-pressed') !== 'true') btn.click();
    });
  });
  const ok = w.document.querySelector('#ov button[data-ok]');
  assert.ok(ok && !ok.disabled, 'award ready');
  ok.click();
}

function awardRandom(w, rng){
  const ov = w.document.getElementById('ov');
  if(ov.hidden) w.eval('award()');
  const pots = j(w, 'pots()');
  for(let i = 0; i < pots.length; i++){
    const el = pots[i].el;
    assert.ok(el.length, 'empty eligible');
    const k = 1 + Math.floor(rng() * el.length);
    const ids = el.slice();
    for(let n = ids.length - 1; n > 0; n--){
      const m = Math.floor(rng() * (n + 1));
      const tmp = ids[n];
      ids[n] = ids[m];
      ids[m] = tmp;
    }
    for(let n = 0; n < k; n++){
      const btn = w.document.querySelector('#ov button[data-i="' + i + '"][data-p="' + ids[n] + '"]');
      assert.ok(btn, 'winner button');
      if(btn.getAttribute('aria-pressed') !== 'true') btn.click();
    }
  }
  const ok = w.document.querySelector('#ov button[data-ok]');
  assert.ok(ok && !ok.disabled, 'award ready');
  ok.click();
}

function answerBust(w, rng, force){
  const ov = w.document.getElementById('ov');
  if(ov.hidden) w.eval('bust()');
  const ks = [...ov.querySelectorAll('button[data-k]')];
  if(force && force.ko != null){
    const b = w.document.querySelector('#ov button[data-k="' + force.ko + '"]');
    if(b) b.click();
  }else if(ks.length){
    ks[Math.floor(rng() * ks.length)].click();
  }
  const want = force && force.rebuy ? '1' : force && force.rebuy === false ? '0' : null;
  const rs = [...w.document.querySelectorAll('#ov button[data-r]')].filter(b => !b.disabled);
  assert.ok(rs.length, 'bust choice');
  let btn = want ? rs.find(b => b.dataset.r === want) : null;
  if(!btn){
    const yes = rs.find(b => b.dataset.r === '1');
    const no = rs.find(b => b.dataset.r === '0');
    btn = (yes && rng() < 0.5) ? yes : no;
  }
  assert.ok(btn && !btn.disabled, 'bust button');
  btn.click();
}

function answerBlinds(w){
  const ov = w.document.getElementById('ov');
  if(ov.hidden) w.eval('nextBlinds()');
  const sb = ov.querySelector('[name=sb]');
  const bb = ov.querySelector('[name=bb]');
  const prev = w.eval('S.bb|0');
  let b = +bb.value, s = +sb.value;
  if(!(b > prev)) b = prev + 2;
  if(!Number.isInteger(s) || s > b) s = Math.floor(b / 2);
  sb.value = String(s);
  bb.value = String(b);
  ov.querySelector('button[data-ok]').click();
  assert.equal(w.eval('S.pend'), false, 'next blinds saved');
}

function pump(w, rng, trace, box){
  for(let i = 0; i < 100; i++){
    note(w, box);
    const st = status(w);
    if(st.bust){ answerBust(w, rng); if(trace) trace('bust'); continue; }
    if(st.pend){ answerBlinds(w); if(trace) trace('blinds'); continue; }
    if(st.showdown){ awardRandom(w, rng); if(trace) trace('award'); continue; }
    return st;
  }
  throw new Error('pump did not settle');
}

function actRandom(w, rng){
  const a = j(w, `(()=>{
    const p=cur(); if(!p) return null;
    const need=Math.max(0, hi()-p.bet);
    return {id:p.id, stack:p.stack|0, need, chips:S.chips.slice()};
  })()`);
  assert.ok(a, 'player to act');
  const choices = ['fold'];
  if(a.need === 0) choices.push('check');
  if(a.need > 0) choices.push('call');
  if(a.stack > 0) choices.push('allin');
  const room = a.stack - a.need;
  if(room > 0) choices.push('chip', 'custom', 'pot');
  const c = choices[Math.floor(rng() * choices.length)];
  if(c === 'chip'){
    let add = 0;
    for(let i = 0; i < 6 && add < room; i++){
      const ch = a.chips[Math.floor(rng() * a.chips.length)] || room;
      add = Math.min(room, add + ch);
      if(rng() < 0.45) break;
    }
    if(add <= 0) add = room;
    w.eval('act("raise",' + (add | 0) + ')');
    return 'chip ' + (add | 0);
  }
  if(c === 'custom'){
    const extra = 1 + Math.floor(rng() * room);
    w.eval('act("raise",' + (extra | 0) + ')');
    return 'custom ' + (extra | 0);
  }
  if(c === 'pot'){
    const fr = rng() < 0.5 ? 1 : 0.5;
    w.eval('sz(' + fr + ')');
    const add = w.eval('S.add|0');
    if(add > 0){ w.eval('act("raise")'); return 'pot ' + fr + ' ' + add; }
    w.eval('act("allin")');
    return 'pot-allin';
  }
  w.eval('act("' + c + '")');
  return c;
}

function toShowdown(w){
  for(let i = 0; i < 80; i++){
    const st = status(w);
    if(st.showdown) return;
    assert.ok(st.actor, 'no actor before showdown ' + JSON.stringify(st));
    const need = w.eval('Math.max(0,hi()-(cur()?cur().bet:0))');
    w.eval(need > 0 ? 'act("call")' : 'act("check")');
  }
  throw new Error('showdown not reached');
}

function going(st){
  const over = !st.pot && !st.bust && !st.pend && st.live < 2;
  return !!(st.actor || st.showdown || st.bust || st.pend || over);
}

module.exports = {
  status, check, snapPos, assertBlinds, assertRotation, note,
  awardPick, awardRandom, answerBust, answerBlinds, pump, actRandom, toShowdown, going
};
