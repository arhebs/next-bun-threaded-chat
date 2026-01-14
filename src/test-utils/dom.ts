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

  const globalRecord = globalThis as unknown as Record<string, unknown>;

  const snapshot: GlobalSnapshot = {
    window: globalRecord["window"],
    document: globalRecord["document"],
    navigator: globalRecord["navigator"],
    HTMLElement: globalRecord["HTMLElement"],
    Node: globalRecord["Node"],
    requestAnimationFrame: globalRecord["requestAnimationFrame"],
    cancelAnimationFrame: globalRecord["cancelAnimationFrame"],
    IS_REACT_ACT_ENVIRONMENT: globalRecord["IS_REACT_ACT_ENVIRONMENT"],
  };

  const window = new Window({
    url: "http://localhost/",
  });

  globalRecord["window"] = window;
  globalRecord["document"] = window.document;
  globalRecord["navigator"] = window.navigator;
  globalRecord["HTMLElement"] = window.HTMLElement;
  globalRecord["Node"] = window.Node;
  globalRecord["IS_REACT_ACT_ENVIRONMENT"] = true;

  if (typeof globalRecord["requestAnimationFrame"] !== "function") {
    globalRecord["requestAnimationFrame"] = (callback: FrameRequestCallback) => {
      return setTimeout(() => callback(Date.now()), 0) as unknown as number;
    };
  }

  if (typeof globalRecord["cancelAnimationFrame"] !== "function") {
    globalRecord["cancelAnimationFrame"] = (handle: number) => {
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    };
  }

  const handle: DomHandle = {
    window,
    cleanup: () => {
      globalRecord["window"] = snapshot.window;
      globalRecord["document"] = snapshot.document;
      globalRecord["navigator"] = snapshot.navigator;
      globalRecord["HTMLElement"] = snapshot.HTMLElement;
      globalRecord["Node"] = snapshot.Node;
      globalRecord["requestAnimationFrame"] = snapshot.requestAnimationFrame;
      globalRecord["cancelAnimationFrame"] = snapshot.cancelAnimationFrame;
      globalRecord["IS_REACT_ACT_ENVIRONMENT"] = snapshot.IS_REACT_ACT_ENVIRONMENT;
      delete globalForDom.__testDomHandle;
    },
  };

  globalForDom.__testDomHandle = handle;
  return handle;
}
