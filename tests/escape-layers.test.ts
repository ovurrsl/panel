import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The Escape chain, tested without a browser.
 *
 * The module binds one listener to `window`, so the test provides the smallest
 * window that satisfies it and then fires the key itself. What is under test is
 * the ordering rule — one press closes exactly one layer, the topmost — which is
 * the part that was previously reimplemented per screen and got it wrong.
 */
let handler: ((event: KeyboardEvent) => void) | null = null;

const stubWindow = {
  addEventListener: vi.fn((type: string, fn: (event: KeyboardEvent) => void) => {
    if (type === 'keydown') handler = fn;
  }),
  removeEventListener: vi.fn((type: string) => {
    if (type === 'keydown') handler = null;
  }),
};

if (typeof vi !== 'undefined' && typeof vi.stubGlobal === 'function') {
  vi.stubGlobal('window', stubWindow);
} else {
  (globalThis as unknown as { window: typeof stubWindow }).window = stubWindow;
}

const { pushEscapeLayer: register, openLayerCount } = await import('@/lib/escape-layers');

/**
 * Pushing a layer through this wrapper records its remover, so a test can leave
 * layers open and still not leak them into the next one. Draining by pressing
 * Escape would not work — closing is the *caller's* job, and a handler that does
 * not remove itself would spin forever.
 */
const opened: Array<() => void> = [];

function pushEscapeLayer(close: () => void): () => void {
  const remove = register(close);
  opened.push(remove);
  return remove;
}

function press(key = 'Escape') {
  const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;
  handler?.(event);
  return event;
}

describe('escape layers', () => {
  afterEach(() => {
    while (opened.length > 0) opened.pop()?.();
    expect(openLayerCount()).toBe(0);
  });

  it('closes nothing when no layer is open', () => {
    expect(openLayerCount()).toBe(0);
    expect(() => press()).not.toThrow();
  });

  it('closes only the topmost layer per press', () => {
    const order: string[] = [];
    pushEscapeLayer(() => order.push('drawer'));
    pushEscapeLayer(() => order.push('dialog'));

    press();
    expect(order).toEqual(['dialog']);
  });

  it('walks down the stack one press at a time', () => {
    const order: string[] = [];
    const closeMenu = pushEscapeLayer(() => {
      order.push('menu');
      closeMenu();
    });
    const closeDrawer = pushEscapeLayer(() => {
      order.push('drawer');
      closeDrawer();
    });
    const closeDialog = pushEscapeLayer(() => {
      order.push('dialog');
      closeDialog();
    });

    press();
    press();
    press();

    // The chain the design specifies, deepest layer first.
    expect(order).toEqual(['dialog', 'drawer', 'menu']);
    expect(openLayerCount()).toBe(0);
  });

  it('ignores every other key', () => {
    const close = vi.fn();
    const remove = pushEscapeLayer(close);

    press('Enter');
    press('a');
    expect(close).not.toHaveBeenCalled();

    remove();
  });

  it('unregisters a layer that closed by other means', () => {
    const close = vi.fn();
    const remove = pushEscapeLayer(close);
    remove();

    press();
    expect(close).not.toHaveBeenCalled();
    expect(openLayerCount()).toBe(0);
  });

  it('removes the right entry when the same handler is stacked twice', () => {
    const shared = vi.fn();
    const removeFirst = pushEscapeLayer(shared);
    pushEscapeLayer(shared);
    expect(openLayerCount()).toBe(2);

    removeFirst();
    expect(openLayerCount()).toBe(1);

    press();
    expect(shared).toHaveBeenCalledTimes(1);
  });

  it('stops the press from reaching anything further out', () => {
    const remove = pushEscapeLayer(() => {});
    const event = press();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    remove();
  });

  it('drops the listener once the last layer closes', () => {
    const remove = pushEscapeLayer(() => {});
    expect(handler).not.toBeNull();

    remove();
    expect(handler).toBeNull();
  });
});
