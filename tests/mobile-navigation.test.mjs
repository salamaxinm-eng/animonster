import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const scroll = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      stripTypeScriptTypes(
        await readFile('lib/mobile-navigation-scroll.ts', 'utf8'),
      ),
    ).toString('base64')
);
const hookSource = ts.transpileModule(
  await readFile('hooks/use-mobile-navigation-visibility.ts', 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

test('small movements accumulate; a real reverse gesture reveals without going to the top', () => {
  let state = scroll.navigationScrollStart();
  for (const y of [3, 6, 9]) {
    state = scroll.navigationScrollStep(state, y, 1000);
    assert.equal(state.hidden, false);
  }
  state = scroll.navigationScrollStep(state, 20, 1000);
  assert.equal(state.hidden, true);
  for (const y of [17, 14, 11]) {
    state = scroll.navigationScrollStep(state, y, 1000);
    assert.equal(state.hidden, true);
  }
  state = scroll.navigationScrollStep(state, 10, 1000);
  assert.equal(state.hidden, false);
});
test('stopping does not reveal; direction changes discard the previous direction distance', () => {
  let state = scroll.navigationScrollStep(
    scroll.navigationScrollStart(200),
    220,
    1000,
  );
  for (let i = 0; i < 100; i++)
    state = scroll.navigationScrollStep(state, 220, 1000);
  assert.equal(state.hidden, true);
  for (const y of [215, 218, 212, 215, 209]) {
    state = scroll.navigationScrollStep(state, y, 1000);
    assert.equal(state.hidden, true);
  }
  state = scroll.navigationScrollStep(state, 205, 1000);
  assert.equal(state.hidden, false);
});
test('rubber band positions are clamped at both ends; top and short pages always show', () => {
  let state = scroll.navigationScrollStep(
    scroll.navigationScrollStart(980),
    1030,
    1000,
  );
  for (const y of [1080, 1020, 1000, 998, 1000]) {
    state = scroll.navigationScrollStep(state, y, 1000);
    assert.equal(state.hidden, true);
  }
  for (const y of [0, -50, -5, 0]) {
    state = scroll.navigationScrollStep(state, y, 1000);
    assert.equal(state.hidden, false);
  }
  state = scroll.navigationScrollStep({ ...state, hidden: true }, 200, -50);
  assert.equal(state.hidden, false);
  state = scroll.navigationScrollStep({ ...state, hidden: true }, 5, 8);
  assert.equal(state.hidden, false);
});

function environment(mobile = true) {
  class Hub {
    listeners = new Map();
    addEventListener(name, fn, options) {
      const list = this.listeners.get(name) || [];
      list.push({ fn, options });
      this.listeners.set(name, list);
    }
    removeEventListener(name, fn) {
      this.listeners.set(
        name,
        (this.listeners.get(name) || []).filter((x) => x.fn !== fn),
      );
    }
    fire(name, target = this) {
      for (const { fn } of this.listeners.get(name) || []) fn({ target });
    }
    count() {
      return [...this.listeners.values()].reduce((n, x) => n + x.length, 0);
    }
  }
  class Element extends Hub {
    scrollHeight = 2000;
    clientHeight = 800;
    scrollTop = 0;
    overlay = false;
    hidden = false;
    closed = false;
    ignored = false;
    isContentEditable = false;
    isConnected = true;
    focusVisible = false;
    expanded = false;
    matches(selector) {
      return selector === ':focus-visible' ? this.focusVisible : this.overlay;
    }
    closest() {
      return this.ignored ? this : null;
    }
    contains(el) {
      return el === this;
    }
    querySelector() {
      return this.expanded ? {} : null;
    }
    hasAttribute(name) {
      return name === 'data-closed' && this.closed;
    }
    getAttribute() {
      return null;
    }
    getClientRects() {
      return this.hidden ? [] : [{}];
    }
  }
  class Input extends Element {
    type = 'search';
    disabled = false;
    readOnly = false;
  }
  class Textarea extends Input {}
  let hidden = false,
    id = 0,
    cleanup;
  const frames = new Map();
  const page = new Element(),
    body = new Element(),
    nav = new Element(),
    win = new Hub(),
    doc = new Hub(),
    observers = [],
    resizes = [],
    openOverlays = [];
  Object.assign(win, {
    scrollY: 0,
    innerHeight: 800,
    visualViewport: new Hub(),
  });
  Object.assign(doc, {
    scrollingElement: page,
    documentElement: page,
    body,
    activeElement: body,
    fullscreenElement: null,
    querySelectorAll: () => openOverlays,
  });
  class MutationObserver {
    constructor(fn) {
      this.fn = fn;
      observers.push(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }
  class ResizeObserver {
    constructor(fn) {
      this.fn = fn;
      resizes.push(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }
  const exported = {};
  const context = {
    exports: exported,
    window: win,
    document: doc,
    Element,
    HTMLElement: Element,
    HTMLInputElement: Input,
    HTMLTextAreaElement: Textarea,
    MutationObserver,
    ResizeObserver,
    getComputedStyle: () => ({ overflowY: 'auto' }),
    requestAnimationFrame: (fn) => {
      frames.set(++id, fn);
      return id;
    },
    cancelAnimationFrame: (key) => frames.delete(key),
    require: (name) => {
      if (name === 'react')
        return {
          useState: () => [
            hidden,
            (value) => {
              hidden = value;
            },
          ],
          useEffect: (fn) => {
            cleanup = fn();
          },
        };
      if (name === '@/hooks/use-mobile') return { useIsMobile: () => mobile };
      if (name === '@/lib/mobile-navigation-scroll') return scroll;
      throw Error('Unexpected dependency ' + name);
    },
  };
  runInNewContext(hookSource, context);
  function flush() {
    const jobs = [...frames.values()];
    frames.clear();
    for (const fn of jobs) fn();
  }
  function mount(route = '/') {
    cleanup?.();
    exported.useMobileNavigationVisibility(route, { current: nav });
    flush();
  }
  mount();
  return {
    win,
    doc,
    page,
    nav,
    frames,
    openOverlays,
    observers,
    resizes,
    Element,
    Input,
    Textarea,
    flush,
    mount,
    get hidden() {
      return hidden;
    },
    dispose: () => cleanup?.(),
    scroll(y, target = page) {
      if (target === page) win.scrollY = y;
      else target.scrollTop = y;
      win.fire('scroll', target === page ? doc : target);
      flush();
    },
    mutate(record = { type: 'childList' }) {
      for (const o of observers) if (o.active) o.fn([record]);
      flush();
    },
  };
}

test('passive scroll is coalesced into one frame and nested containers use their own positions', () => {
  const e = environment();
  const options = e.win.listeners.get('scroll')[0].options;
  assert.equal(options.passive, true);
  assert.equal(options.capture, true);
  e.win.scrollY = 50;
  e.win.fire('scroll', e.doc);
  e.win.scrollY = 90;
  e.win.fire('scroll', e.doc);
  assert.equal(e.frames.size, 1);
  e.flush();
  assert.equal(e.hidden, true);
  e.scroll(84);
  assert.equal(e.hidden, true);
  e.scroll(80);
  assert.equal(e.hidden, false);
  const nested = new e.Element();
  e.scroll(60, nested);
  assert.equal(e.hidden, true);
  e.scroll(48, nested);
  assert.equal(e.hidden, false);
  const editor = new e.Element();
  editor.ignored = true;
  e.scroll(400, editor);
  assert.equal(e.hidden, false);
  e.scroll(80, nested);
  assert.equal(e.hidden, true);
  nested.isConnected = false;
  e.page.scrollHeight = 805;
  e.win.scrollY = 0;
  e.mutate();
  assert.equal(e.hidden, false);
  e.dispose();
});
test('input and modal overlays hide navigation, then restore without reacting to keyboard scroll jumps', () => {
  const e = environment();
  e.doc.activeElement = new e.Input();
  e.doc.fire('focusin');
  e.flush();
  assert.equal(e.hidden, true);
  e.scroll(300);
  assert.equal(e.hidden, true);
  e.doc.activeElement = e.doc.body;
  e.doc.fire('focusout');
  e.flush();
  assert.equal(e.hidden, false);
  const dialog = new e.Element();
  dialog.overlay = true;
  e.openOverlays.push(dialog);
  e.mutate();
  assert.equal(e.hidden, true);
  dialog.closed = true;
  e.mutate({
    type: 'attributes',
    attributeName: 'data-closed',
    target: dialog,
  });
  assert.equal(e.hidden, false);
  dialog.closed = false;
  dialog.hidden = true;
  e.mutate();
  assert.equal(e.hidden, false);
  e.dispose();
});
test('standard, native iOS and faux fullscreens suppress navigation; shrinking page restores it', () => {
  const e = environment();
  e.doc.fullscreenElement = new e.Element();
  e.doc.fire('fullscreenchange');
  e.flush();
  assert.equal(e.hidden, true);
  e.doc.fullscreenElement = null;
  e.doc.fire('fullscreenchange');
  e.flush();
  assert.equal(e.hidden, false);
  e.doc.fire('webkitbeginfullscreen');
  e.flush();
  assert.equal(e.hidden, true);
  e.doc.fire('webkitendfullscreen');
  e.flush();
  assert.equal(e.hidden, false);
  const full = new e.Element();
  full.overlay = true;
  e.openOverlays.push(full);
  e.mutate({ type: 'attributes', attributeName: 'class', target: full });
  assert.equal(e.hidden, true);
  e.openOverlays.pop();
  e.mutate({
    type: 'attributes',
    attributeName: 'class',
    target: full,
    oldValue: 'demo-faux-fullscreen',
  });
  assert.equal(e.hidden, false);
  e.scroll(300);
  assert.equal(e.hidden, true);
  e.page.scrollHeight = 805;
  e.win.scrollY = 0;
  e.resizes[0].fn();
  e.flush();
  assert.equal(e.hidden, false);
  e.dispose();
});
test('route changes and history restores reveal, while cleanup removes listeners, observers and queued work', () => {
  const e = environment();
  e.scroll(300);
  assert.equal(e.hidden, true);
  e.mount('/profile?section=list');
  assert.equal(e.hidden, false);
  e.scroll(330);
  assert.equal(e.hidden, true);
  e.win.fire('pageshow');
  e.flush();
  assert.equal(e.hidden, false);
  e.win.fire('scroll', e.doc);
  assert.equal(e.frames.size, 1);
  e.dispose();
  assert.equal(e.frames.size, 0);
  assert.equal(e.win.count(), 0);
  assert.equal(e.doc.count(), 0);
  assert.equal(e.win.visualViewport.count(), 0);
  assert.ok(e.observers.every((x) => !x.active));
  assert.ok(e.resizes.every((x) => !x.active));
  const desktop = environment(false);
  assert.equal(desktop.hidden, false);
  assert.equal(desktop.win.count(), 0);
  assert.equal(desktop.observers.length, 0);
});

test('touch focus does not pin the menu after navigation; keyboard focus and an open profile menu do', () => {
  const e = environment();
  e.doc.activeElement = e.nav;
  e.scroll(30);
  assert.equal(e.hidden, true);
  e.nav.focusVisible = true;
  e.scroll(50);
  assert.equal(e.hidden, false);
  e.nav.focusVisible = false;
  e.nav.expanded = true;
  e.scroll(70);
  assert.equal(e.hidden, false);
  e.nav.expanded = false;
  e.scroll(90);
  assert.equal(e.hidden, true);
  e.dispose();
});
