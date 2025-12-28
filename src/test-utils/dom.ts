import { Window } from "happy-dom";

export type DomHandle = {
  window: Window;
  cleanup: () => void;
};

type GlobalSnapshot = {
  window?: unknown;
  document?: unknown;
  navigator?: unknown;
  HTMLElement?: unknown;
  Node?: unknown;
  requestAnimationFrame?: unknown;
  cancelAnimationFrame?: unknown;
  IS_REACT_ACT_ENVIRONMENT?: unknown;
};

export function installDom(): DomHandle {
  const globalForDom = globalThis as typeof globalThis & {
    __testDomHandle?: DomHandle;
  };

  if (globalForDom.__testDomHandle) {
    return globalForDom.__testDomHandle;
  }

  const snapshot: GlobalSnapshot = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    navigator: (globalThis as any).navigator,
    HTMLElement: (globalThis as any).HTMLElement,
    Node: (globalThis as any).Node,
    requestAnimationFrame: (globalThis as any).requestAnimationFrame,
    cancelAnimationFrame: (globalThis as any).cancelAnimationFrame,
    IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT,
  };

  const window = new Window({
    url: "http://localhost/",
  });

  (globalThis as any).window = window;
  (globalThis as any).document = window.document;
  (globalThis as any).navigator = window.navigator;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).Node = window.Node;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  if (typeof (globalThis as any).requestAnimationFrame !== "function") {
    (globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
      return setTimeout(() => callback(Date.now()), 0) as unknown as number;
    };
  }

  if (typeof (globalThis as any).cancelAnimationFrame !== "function") {
    (globalThis as any).cancelAnimationFrame = (handle: number) => {
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    };
  }

  const handle: DomHandle = {
    window,
    cleanup: () => {
      (globalThis as any).window = snapshot.window;
      (globalThis as any).document = snapshot.document;
      (globalThis as any).navigator = snapshot.navigator;
      (globalThis as any).HTMLElement = snapshot.HTMLElement;
      (globalThis as any).Node = snapshot.Node;
      (globalThis as any).requestAnimationFrame = snapshot.requestAnimationFrame;
      (globalThis as any).cancelAnimationFrame = snapshot.cancelAnimationFrame;
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT =
        snapshot.IS_REACT_ACT_ENVIRONMENT;
      delete globalForDom.__testDomHandle;
    },
  };

  globalForDom.__testDomHandle = handle;
  return handle;
}
