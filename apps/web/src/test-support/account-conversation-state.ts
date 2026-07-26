import type { AccountConversationBroadcast } from "../account-conversation-state.ts";

export class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export class BroadcastHub {
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  create = (name: string): AccountConversationBroadcast => {
    let closed = false;
    return {
      addEventListener: (_type, listener) => {
        const listeners = this.listeners.get(name) ?? new Set();
        listeners.add(listener);
        this.listeners.set(name, listeners);
      },
      close: () => {
        closed = true;
      },
      postMessage: (data) => {
        if (closed) throw new DOMException("Channel is closed", "InvalidStateError");
        for (const listener of this.listeners.get(name) ?? []) {
          listener(new MessageEvent("message", { data }));
        }
      },
      removeEventListener: (_type, listener) => {
        this.listeners.get(name)?.delete(listener);
      },
    };
  };
}
