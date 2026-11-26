'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');

const root = path.join(__dirname, '..');

function load(prep){
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', () => {});
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window){
      window.matchMedia = () => ({
        matches: false,
        media: '',
        addEventListener(){},
        removeEventListener(){},
        addListener(){},
        removeListener(){}
      });
      window.alert = () => {};
      window.confirm = () => true;
      window.scrollTo = () => {};
      if(prep) prep(window);
    }
  });
  return dom.window;
}

function j(w, expr){
  return JSON.parse(w.eval('JSON.stringify(' + expr + ')'));
}

function q(w, sel){
  const el = w.document.querySelector(sel);
  if(!el) throw new Error('missing ' + sel);
  return el;
}

function click(w, sel){
  q(w, sel).click();
}

module.exports = {load, j, q, click, root, fs};
