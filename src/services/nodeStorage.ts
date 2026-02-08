import fs from "fs";
import path from "path";
import { expandHome } from "../lib/paths";

/**
 * A minimal localStorage-compatible adapter for Node.js
 * Stores auth tokens in ~/.config/curator/auth-storage.json
 */
class NodeStorage implements Storage {
  private storePath: string;
  private cache: Record<string, string> = {};

  constructor() {
    this.storePath = expandHome(
      path.join(process.env.HOME || "", ".config", "curator", "auth-storage.json")
    );
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.storePath)) {
      try {
        this.cache = JSON.parse(fs.readFileSync(this.storePath, "utf-8"));
      } catch {
        this.cache = {};
      }
    }
  }

  private save(): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.storePath, JSON.stringify(this.cache, null, 2));
  }

  get length(): number {
    return Object.keys(this.cache).length;
  }

  clear(): void {
    this.cache = {};
    this.save();
  }

  getItem(key: string): string | null {
    return this.cache[key] || null;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.cache);
    return keys[index] || null;
  }

  removeItem(key: string): void {
    delete this.cache[key];
    this.save();
  }

  setItem(key: string, value: string): void {
    this.cache[key] = value;
    this.save();
  }
}

export function installNodeStorage(): void {
  // Install localStorage polyfill (force override - auth SDK sets a broken one)
  const storage = new NodeStorage();
  (globalThis as any).localStorage = storage;
  
  // Install minimal EventTarget polyfills (auth SDK needs these)
  if (typeof (globalThis as any).dispatchEvent === "undefined") {
    (globalThis as any).dispatchEvent = () => true;
    (globalThis as any).addEventListener = () => {};
    (globalThis as any).removeEventListener = () => {};
  }
}
