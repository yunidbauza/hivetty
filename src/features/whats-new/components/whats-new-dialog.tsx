import { X } from '@phosphor-icons/react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@components/ui/button';
import { PIECES } from '@features/whats-new/pieces';
import type { PieceKind, WhatsNew } from '@features/whats-new/releases';
import { type CanvasPaint, useCanvasLoop } from '@hooks/use-canvas-loop';
import { useReducedMotion } from '@hooks/use-reduced-motion';
import { useSwarmPalette } from '@stores/appearance-store';

/** A slide's corner piece on its own canvas, clocked from zero when the slide appears. */
function PieceCanvas({ kind }: { kind: PieceKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const palette = useSwarmPalette();
  const reduced = useReducedMotion();
  const piece = PIECES[kind];
  const paint = useCallback<CanvasPaint>(
    (ctx, t, _dt, { w, h, dpr }) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      piece.draw(ctx, w, h, t % piece.dur, palette);
    },
    [piece, palette],
  );
  useCanvasLoop(ref, paint, { still: reduced ? piece.rest : null });

  return <canvas ref={ref} data-piece={kind} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}

/**
 * The What's new card (1.0, variant A): three slides over a dimmed app, each
 * with its corner piece top right. Back and Next walk them, the dots jump, ←
 * and → move, Esc closes; the last button closes too. However it closes, the
 * caller records the version as seen, with the box's answer.
 */
export function WhatsNewDialog({ entry, onClose }: { entry: WhatsNew; onClose: (optOut: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [optOut, setOptOut] = useState(false);
  const id = useId();
  const slides = entry.slides;
  const slide = slides[index]!;
  const last = index === slides.length - 1;
  const go = (next: number) => setIndex(Math.max(0, Math.min(slides.length - 1, next)));
  const close = () => onClose(optOut);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(index - 1);
    }
  };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <DialogPrimitive.Content
          aria-describedby={`${id}-body`}
          onKeyDown={onKeyDown}
          className="fixed top-1/2 left-1/2 z-50 flex min-h-[350px] w-[560px] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-panel text-ink shadow-2xl outline-none"
        >
          {/* The creep's glow on its own wider layer, so it fades out instead of ending at the canvas's edge. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 h-[240px] w-[320px] bg-[radial-gradient(ellipse_at_62%_28%,color-mix(in_srgb,var(--cc-creep)_26%,transparent),transparent_62%)]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute top-0 right-[34px] h-[140px] w-[180px]">
            <PieceCanvas key={index} kind={slide.piece} />
          </div>
          <DialogPrimitive.Close
            aria-label="Close What's new"
            className="absolute top-2.5 right-2.5 z-10 grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink"
          >
            <X size={15} />
          </DialogPrimitive.Close>

          <div className="px-[22px] pt-[26px] pb-[18px]" aria-live="polite">
            <p className="font-mono text-micro font-semibold tracking-[0.14em] text-brand uppercase opacity-85">
              What’s new in {entry.version}
            </p>
            <DialogPrimitive.Title className="mt-3.5 mb-2 max-w-[calc(100%-150px)] text-[22px] leading-[1.15] font-semibold tracking-[-0.015em] text-balance text-ink">
              {slide.title}
            </DialogPrimitive.Title>
            <p id={`${id}-body`} className="max-w-[min(46ch,calc(100%-190px))] text-ui leading-[1.6] text-muted">
              {slide.body}
            </p>
            <ul className="mt-3 grid gap-1.5 text-ui text-ink">
              {slide.points.map((point) => (
                <li key={point} className="flex items-baseline gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-2 w-[7px] flex-none bg-brand [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2.5 border-t border-border px-[18px] py-3">
            <label className="flex cursor-pointer items-center gap-[7px] text-control text-muted select-none">
              <input
                type="checkbox"
                checked={optOut}
                onChange={(event) => setOptOut(event.target.checked)}
                className="size-3.5 accent-brand-fill"
              />
              Don’t show What’s new again
            </label>
            <div className="mx-auto flex gap-1.5" role="tablist" aria-label="Slides">
              {slides.map((s, k) => (
                <button
                  key={s.title}
                  type="button"
                  role="tab"
                  aria-label={s.title}
                  aria-selected={k === index}
                  onClick={() => go(k)}
                  className={`h-1.5 w-[22px] rounded ${k === index ? 'bg-brand' : 'bg-border'}`}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              {index > 0 ? <Button onClick={() => go(index - 1)}>Back</Button> : null}
              <Button variant="primary" onClick={() => (last ? close() : go(index + 1))}>
                {last ? `Start using ${entry.version}` : 'Next'}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
