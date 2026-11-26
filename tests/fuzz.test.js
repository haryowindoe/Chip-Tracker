'use strict';
const test = require('node:test');
const {load, j} = require('./helpers');
const {check, note, pump, actRandom, going} = require('./drive');

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function play(w, seed){
  const rng = mulberry32(seed);
  const events = [];
  const trace = s => {
    events.push(s);
    if(events.length > 20) events.shift();
  };
  const box = {mark: null};
  const fail = msg => {
    let extra = '';
    try{
      extra = '\n' + w.eval('JSON.stringify({issued:S.issued,pot:S.pot,hand:S.hand,sb:S.sb,bb:S.bb,bbi:S.bbi,sbi:S.sbi,sel:S.sel,q:S.q,pend:S.pend,pl:S.pl.map(p=>({n:p.name,s:p.stack,b:p.bet,i:p.in||0,f:p.fold?1:0}))})');
    }catch(e){}
    throw new Error('seed ' + seed + '\n' + events.join('\n') + extra + '\n' + msg);
  };
  try{
    const n = 2 + Math.floor(rng() * 9);
    w.eval('S=def();U.length=0;document.getElementById("ov").hidden=true;document.getElementById("ov").innerHTML="";');
    for(let i = 0; i < n; i++) w.eval("seatNamed('P" + (i + 1) + "')");
    w.eval('seatBtn()');
    check(w);
    trace('seat ' + n);
    let steps = 0;
    let last = '';
    let spin = 0;
    while(steps++ < 40000){
      let st = pump(w, rng, trace, box);
      if(st.hand > 300) break;
      if(!st.pot && !st.bust && !st.pend && st.live < 2) break;
      if(!st.pot && !st.bust && !st.pend){
        w.eval('run(deal)');
        trace('deal');
        note(w, box);
        st = pump(w, rng, trace, box);
      }
      if(st.hand > 300) break;
      if(!st.pot && !st.bust && !st.pend && st.live < 2) break;
      if(!going(st)) fail('stuck ' + JSON.stringify(st));
      if(st.only && rng() < 0.25){
        const ids = j(w, 'S.pl.filter(chipIn).map(p=>p.id)');
        if(ids.length >= 2){
          const id = ids[Math.floor(rng() * ids.length)];
          w.eval('run(()=>moveBtn(' + id + '))');
          trace('btn ' + id);
          note(w, box);
          st = pump(w, rng, trace, box);
          if(!going(st)) fail('stuck after button ' + JSON.stringify(st));
        }
      }
      if(st.hand > 300 || (!st.pot && !st.bust && !st.pend && st.live < 2)) break;
      if(!st.actor) fail('stuck ' + JSON.stringify(st));
      const label = actRandom(w, rng);
      trace('h' + w.eval('S.hand') + ' ' + label);
      note(w, box);
      const key = w.eval('S.hand+"|"+S.pot+"|"+S.st+"|"+S.sel+"|"+(S.q&&S.q.length)+"|"+S.pend+"|"+S.pl.map(p=>p.stack+"/"+(p.fold?1:0)).join(",")');
      if(key === last){
        if(++spin > 50) fail('no progress');
      }else spin = 0;
      last = key;
    }
    check(w);
    const hand = w.eval('S.hand|0');
    const live = w.eval('S.pl.filter(p=>p.stack>0).length');
    if(hand <= 300 && live >= 2 && steps >= 40000) fail('step cap');
  }catch(e){
    if(String(e && e.message || e).indexOf('seed ' + seed) === 0) throw e;
    fail(e && e.stack ? e.stack : String(e));
  }
}

test('fuzz seeded games', {timeout: 2 * 60 * 60 * 1000}, () => {
  const w = load();
  for(let seed = 1; seed <= 500; seed++) play(w, seed);
});
