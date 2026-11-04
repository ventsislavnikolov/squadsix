import { afterEach } from "vitest";

// jsdom lacks the pointer-capture, scrolling and resize APIs that Radix
// primitives (Select, Popover, Switch) call. Node-environment test files have
// no window, so they are left alone.
class ResizeObserverStub {
  readonly observed = new Set<Element>();

  disconnect() {
    this.observed.clear();
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }
}

if (typeof window !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  // The router restores scroll on navigation; jsdom only logs "not implemented".
  window.scrollTo = () => undefined;
  globalThis.ResizeObserver ??=
    ResizeObserverStub as unknown as typeof ResizeObserver;

  // findBy and waitFor give up after 1 s by default, too soon when the
  // pre-push hook runs the suite on a busy machine.
  const { cleanup, configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 5000 });
  // Vitest globals are off, so Testing Library cannot unmount on its own.
  afterEach(cleanup);
}
