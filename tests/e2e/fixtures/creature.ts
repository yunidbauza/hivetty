import { expect, type Locator } from '@playwright/test';

/**
 * A `SwarmCreature`'s canvas, read back (HIVE-221): the canvas inside the
 * laid-out creature, which bleeds past it (HIVE-222).
 *
 * The creatures are drawn, not decoded, so "it rendered" means pixels: the
 * share of the canvas with any alpha, and a digest of every byte so two reads
 * can be compared for a still frame.
 */
export async function readCreature(creature: Locator): Promise<{ painted: number; digest: number; edge: number }> {
  return creature.evaluate((el) => {
    const canvas = el.querySelector('canvas')!;
    const { width: w, height: h } = canvas;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, w, h);
    let lit = 0;
    let digest = 0;
    let edge = 0;
    for (let i = 0; i < data.length; i++) {
      digest = (digest * 31 + data[i]!) | 0;
      if (i % 4 !== 3) continue;
      if (data[i]! > 0) lit++;
      const px = (i - 3) / 4;
      const x = px % w;
      const y = Math.floor(px / w);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = Math.max(edge, data[i]!);
    }
    return { painted: lit / (data.length / 4), digest, edge };
  });
}

/**
 * The creature is laid out at a real size and, once a frame has run, has
 * painted more than 2% of its canvas: a blank or collapsed canvas fails here.
 * Then, over a second of frames, nothing it draws reaches the canvas's edge
 * above 2% alpha: a ring, a glow or a wingtip cut off by the canvas fails here
 * (HIVE-222).
 */
export async function expectCreatureDrawn(creature: Locator): Promise<void> {
  await expect(creature).toBeVisible();
  expect(await creature.evaluate((el) => el.querySelector('canvas')?.tagName)).toBe('CANVAS');
  const box = await creature.boundingBox();
  expect(box?.height).toBeGreaterThan(50);
  await expect.poll(async () => (await readCreature(creature)).painted).toBeGreaterThan(0.02);
  for (let read = 0; read < 6; read++) {
    expect((await readCreature(creature)).edge).toBeLessThan(6);
    await creature.page().waitForTimeout(200);
  }
}
