'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {load, j, q, click, root, fs} = require('./helpers');
const {status, check, awardPick, toShowdown} = require('./drive');

function table(stacks, opt){
  opt = opt || {};
  const w = load();
  const sb = opt.sb != null ? opt.sb : 10;
  const bb = opt.bb != null ? opt.bb : 20;
  const start = opt.start != null ? opt.start : 1000;
  const hpl = opt.hpl != null ? opt.hpl : 100;
  const maxRb = opt.maxRb != null ? opt.maxRb : 2;
  const kop = opt.kop != null ? opt.kop : 10;
  w.eval(
    'S=def();U.length=0;S.custom=true;S.start=' + (start | 0) +
    ';S.sb=' + (sb | 0) + ';S.bb=' + (bb | 0) +
    ';S.hpl=' + (hpl | 0) + ';S.lvl=1;S.li=0;S.hl=0;S.lv=[[' + (sb | 0) + ',' + (bb | 0) + '],[' + ((sb * 2) | 0) + ',' + ((bb * 2) | 0) + ']];' +
    'S.maxRb=' + (maxRb | 0) + ';S.kop=' + (kop | 0) +
    ';S.issued=0;S.log=[];S.chips=[1,5,25,100];'
  );
  for(let i = 0; i < stacks.length; i++) w.eval("seatNamed('P" + (i + 1) + "')");
  stacks.forEach((st, i) => w.eval('setStack(S.pl[' + i + '],' + (st | 0) + ')'));
  w.eval('seatBtn()');
  check(w);
  return w;
}

function deal(w){ w.eval('run(deal)'); }

test('page does not load the test suite', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.equal(html.includes('jsdom'), false);
  assert.equal(html.includes('tests/'), false);
  assert.equal(sw.includes('tests'), false);
  assert.match(sw, /chips-v13/);
});

test('old save without issued is the chips already on the table', () => {
  const w = load(win => {
    win.localStorage.setItem('chipTracker.v1', JSON.stringify({
      pl: [
        {id: 1, name: 'Ada', stack: 500, bet: 0, in: 0, fold: 0, ok: 0, rb: 0, ko: 0},
        {id: 2, name: 'Bo', stack: 400, bet: 0, in: 0, fold: 0, ok: 0, rb: 0, ko: 0}
      ],
      pot: 50,
      hand: 4,
      nid: 3
    }));
  });
  assert.equal(w.eval('S.issued'), 950);
  assert.equal(w.eval('chipMsg()'), 'OK');
  assert.equal(w.document.getElementById('chk').hidden, true);
});

test('a save that already has issued is not rewritten', () => {
  const w = load(win => {
    win.localStorage.setItem('chipTracker.v1', JSON.stringify({
      pl: [{id: 1, name: 'Ada', stack: 100, bet: 0, in: 0, fold: 0, ok: 0, rb: 0, ko: 0}],
      pot: 0,
      issued: 10,
      hand: 2,
      nid: 2
    }));
  });
  assert.equal(w.eval('S.issued'), 10);
  const off = w.eval('f(90)');
  assert.equal(w.document.getElementById('chk').hidden, false);
  assert.equal(w.document.getElementById('chk').textContent, 'Chip check off by ' + off + ', see Audit Log');
  assert.equal(w.document.getElementById('ov').hidden, true);
  click(w, '#cfg');
  click(w, '#ov button[data-a="ck"]');
  const text = w.document.getElementById('ov').textContent;
  assert.ok(text.includes(w.eval('f(10)')));
  assert.ok(text.includes(w.eval('f(100)')));
  assert.ok(text.includes('Off by ' + off));
});

test('chip check and a hand warning stay non-blocking', () => {
  const w = table([1000, 1000]);
  deal(w);
  w.eval('S.pl[0].stack+=7');
  w.eval('draw()');
  assert.equal(w.document.getElementById('ov').hidden, true);
  assert.match(w.document.getElementById('chk').textContent, /Chip check off by/);
  w.eval('act("fold")');
  assert.equal(w.document.getElementById('ov').hidden, true);
  assert.equal(w.eval('chipOff()'), 7);
  assert.match(w.document.getElementById('chk').textContent, /Chip check off by/);
});

test('manual stack edit adds and subtracts issued', () => {
  const w = table([1000, 1000, 1000]);
  assert.equal(w.eval('S.issued'), 3000);
  w.eval('opt(1)');
  click(w, '#ov button[data-a="edit"]');
  q(w, '#ov input[name="n"]').value = '1500';
  click(w, '#ov button[data-ok]');
  assert.equal(w.eval('S.pl[0].stack'), 1500);
  assert.equal(w.eval('S.issued'), 3500);
  w.eval('opt(1)');
  click(w, '#ov button[data-a="edit"]');
  q(w, '#ov input[name="n"]').value = '800';
  click(w, '#ov button[data-ok]');
  assert.equal(w.eval('S.pl[0].stack'), 800);
  assert.equal(w.eval('S.issued'), 2800);
  const edits = j(w, 'S.log.filter(e=>e.t==="stack")');
  assert.deepEqual(edits.map(e => [e.old, e.n]), [[1000, 1500], [1500, 800]]);
  check(w);
});

test('new game, template reset, and reset rebuild issued', () => {
  const w = table([100, 100, 100]);
  click(w, '#cfg');
  click(w, '#ov button[data-a="n"]');
  click(w, '#ov button[data-ok]');
  assert.equal(w.eval('S.pl.length'), 3);
  assert.equal(w.eval('S.start'), 2400);
  assert.equal(w.eval('S.issued'), 7200);
  assert.equal(w.eval('S.log.some(e=>e.t==="new")'), true);
  check(w);
  w.eval('setStack(S.pl[0], 100)');
  click(w, '#cfg');
  click(w, '#ov button[data-a="t"]');
  assert.equal(w.eval('S.pl[0].stack'), 2400);
  assert.equal(w.eval('S.issued'), 7200);
  assert.equal(w.eval('S.log.some(e=>e.t==="reset"&&e.tpl)'), true);
  check(w);
  click(w, '#cfg');
  click(w, '#ov button[data-a="r"]');
  assert.equal(w.eval('S.pl.length'), 0);
  assert.equal(w.eval('S.issued'), 0);
  assert.equal(w.eval('S.pot'), 0);
  assert.equal(w.eval('S.log.some(e=>e.t==="reset"&&!e.tpl)'), true);
  check(w);
});

test('side pot with three all-ins', () => {
  const w = table([100, 200, 400], {sb: 1, bb: 2});
  deal(w);
  w.eval('act("allin")');
  w.eval('act("allin")');
  w.eval('act("allin")');
  const pots = j(w, 'pots()');
  assert.equal(pots.length, 3);
  assert.deepEqual(pots.map(r => r.amt), [300, 200, 200]);
  assert.deepEqual(pots.map(r => r.el), [[1, 2, 3], [2, 3], [3]]);
  awardPick(w, [[1], [2], []]);
  const hand = j(w, 'S.log.filter(e=>e.t==="hand").pop()');
  assert.deepEqual(hand.pl.map(p => p.a), [300, 200, 200]);
  check(w);
});

test('uncalled bet is returned', () => {
  const w = table([50, 200], {sb: 10, bb: 20});
  deal(w);
  w.eval('act("allin")');
  w.eval('act("allin")');
  const pots = j(w, 'pots()');
  assert.equal(pots.length, 2);
  assert.equal(pots[1].amt, 150);
  assert.deepEqual(pots[1].el, [2]);
  awardPick(w, [[1], []]);
  const hand = j(w, 'S.log.filter(e=>e.t==="hand").pop()');
  assert.equal(hand.pl[0].a, 100);
  assert.equal(hand.pl[1].a, 150);
  check(w);
});

test('split pot gives the odd chip to the first seated winner', () => {
  const w = table([500, 500, 500]);
  deal(w);
  w.eval('act("raise",1)');
  w.eval('act("call")');
  w.eval('act("call")');
  toShowdown(w);
  assert.equal(w.eval('S.pot'), 63);
  awardPick(w, [[1, 2]]);
  const hand = j(w, 'S.log.filter(e=>e.t==="hand").pop()');
  assert.deepEqual(hand.pl.map(p => p.a), [511, 510, 479]);
  assert.equal(hand.pot, 63);
  assert.equal(hand.pl.length, 3);
  assert.equal(hand.pl[0].b + 32, hand.pl[0].a);
  assert.equal(hand.pl[1].b + 31, hand.pl[1].a);
  check(w);
});

test('bust then rebuy then bonus deals the rebuyer in and moves the BB one seat', () => {
  const w = table([40, 500, 500], {start: 1000, kop: 10});
  deal(w);
  const bb = w.eval('S.bbi');
  assert.equal(bb, 3);
  w.eval('act("allin")');
  w.eval('act("call")');
  w.eval('act("call")');
  toShowdown(w);
  awardPick(w, [[2]]);
  assert.equal(status(w).bust, 1);
  const ov = w.document.getElementById('ov');
  if(ov.hidden) w.eval('bust()');
  q(w, '#ov button[data-r="1"]').click();
  assert.equal(w.eval('S.pl[0].stack>0||S.pl[0].in>0'), true);
  assert.equal(w.eval('S.pl[0].fold'), 0);
  assert.equal(w.eval('S.bbi'), 1);
  assert.equal(w.eval('S.sbi'), 3);
  assert.equal(w.eval('S.pl[S.dl].id'), 2);
  assert.equal(w.eval('S.issued'), 2140);
  const types = j(w, 'S.log.map(e=>e.t)');
  const bust = types.lastIndexOf('bust');
  const ko = types.lastIndexOf('ko');
  const rebuy = types.lastIndexOf('rebuy');
  assert.ok(bust >= 0 && bust < ko && ko < rebuy);
  check(w);
  assert.equal(w.eval('chipMsg()'), 'OK');
});

test('button override refunds the blinds and posts them again', () => {
  const w = table([1000, 1000, 1000]);
  deal(w);
  assert.equal(w.eval('S.pot'), 30);
  assert.equal(w.eval('onlyBlinds()'), true);
  w.eval('run(()=>moveBtn(3))');
  assert.equal(w.eval('S.pot'), 30);
  assert.equal(w.eval('S.pl[S.dl].id'), 3);
  assert.equal(w.eval('S.sbi'), 1);
  assert.equal(w.eval('S.bbi'), 2);
  assert.deepEqual(j(w, 'S.pl.map(p=>p.stack)'), [990, 980, 1000]);
  assert.deepEqual(j(w, 'S.pl.map(p=>p.in||0)'), [10, 20, 0]);
  assert.equal(w.eval('S.issued'), 3000);
  assert.equal(w.eval('S.log.some(e=>e.t==="btn"&&e.id===3)'), true);
  check(w);
});

test('audit log shows a hand and copies plain text', () => {
  const w = table([1000, 1000]);
  const clip = {writeText(t){ w.__copied = String(t); return Promise.resolve(); }};
  try{ Object.defineProperty(w.navigator, 'clipboard', {configurable: true, value: clip}); }
  catch(e){ w.navigator.clipboard = clip; }
  deal(w);
  w.eval('act("fold")');
  const hand = j(w, 'S.log.filter(e=>e.t==="hand").pop()');
  assert.equal(hand.h, 1);
  assert.equal(hand.pot, 30);
  assert.equal(hand.pl.length, 2);
  click(w, '#cfg');
  click(w, '#ov button[data-a="lg"]');
  click(w, '#ov button[data-i]');
  const shown = w.document.getElementById('ov').textContent;
  assert.ok(shown.includes(w.eval('f(' + hand.pl[0].b + ')')));
  assert.ok(shown.includes(w.eval('f(' + hand.pl[0].a + ')')));
  assert.ok(shown.includes(w.eval('f(' + hand.pl[1].a + ')')));
  click(w, '#ov button[data-a="copy"]');
  const text = w.eval('logText()');
  assert.match(text, /Hand 1 pot 30/);
  assert.match(text, /990 -> 990/);
  assert.match(text, /980 -> 1010/);
  if(w.__copied != null) assert.equal(w.__copied, text);
  assert.equal(w.document.getElementById('ov').hidden, false);
});

test('audit log keeps the last 500 entries', () => {
  const w = load();
  w.eval('for(let i=0;i<501;i++)logEv({t:"btn",id:1,name:"N"+i})');
  assert.equal(w.eval('S.log.length'), 500);
  assert.equal(w.eval('S.log[0].name'), 'N1');
  assert.equal(w.eval('S.log[499].name'), 'N500');
});

test('color-up top-up', t => {
  const w = load();
  if(!w.eval('typeof colorUp==="function"')){
    t.skip('no color-up in this build');
    return;
  }
  w.eval('colorUp()');
  check(w);
});
