/**
 * A 2D context that draws nothing and records everything (HIVE-199).
 *
 * happy-dom has no canvas, and a real one would prove nothing a unit test can
 * see anyway: these fakes assert plumbing — what was called, with which
 * colours — never pixels. Pixels belong to Playwright.
 */
export interface Recorded {
  op: string;
  args: unknown[];
}

export function recordingContext(): { ctx: CanvasRenderingContext2D; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const props: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1 };
  const gradient = {
    addColorStop: (...args: unknown[]) => calls.push({ op: 'addColorStop', args }),
  };

  const ctx = new Proxy(props, {
    get(target, name: string) {
      if (name in target) return target[name];
      if (name === 'measureText') return (text: string) => ({ width: text.length * 6 });
      return (...args: unknown[]) => {
        calls.push({ op: name, args });
        return name.startsWith('create') ? gradient : undefined;
      };
    },
    set(target, name: string, value: unknown) {
      target[name] = value;
      calls.push({ op: `set:${name}`, args: [value] });
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Every colour a recorded drawing assigned to a style property. */
export const coloursUsed = (calls: Recorded[]): unknown[] =>
  calls
    .filter((c) => ['set:fillStyle', 'set:strokeStyle', 'set:shadowColor'].includes(c.op))
    .map((c) => c.args[0])
    .filter((value) => typeof value === 'string');
