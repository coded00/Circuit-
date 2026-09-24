"use client";

import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

type Point = { x: number; y: number };

/**
 * A bounded, pannable bracket surface.  A large elimination tree can be
 * viewed all at once in Fit mode, while its cards remain usable through the
 * explicit zoom controls instead of forcing the whole document to scroll.
 */
export function BracketCanvas({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ point: Point; pan: Point } | null>(null);
  const userAdjustedRef = useRef(false);
  const [fitScale, setFitScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    // offset dimensions deliberately ignore this element's CSS transform.
    // Measuring scrollWidth/scrollHeight here would include the current
    // zoom in some browsers and make ResizeObserver oscillate between Fit
    // and 100% whenever the scaled visual bounds change.
    const width = content.offsetWidth;
    const height = content.offsetHeight;
    if (!width || !height) return;

    // Keep a small breathing room around the overview and below the controls.
    const nextScale = Math.min(1, (viewport.clientWidth - 32) / width, (viewport.clientHeight - 72) / height);
    const nextPan = {
      x: Math.max(16, (viewport.clientWidth - width * nextScale) / 2),
      y: Math.max(56, (viewport.clientHeight - height * nextScale) / 2),
    };
    setFitScale(nextScale);
    if (!userAdjustedRef.current) {
      setScale(nextScale);
      setPan(nextPan);
    }
  }, []);

  useLayoutEffect(() => {
    fit();
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [fit]);

  function applyFit() {
    userAdjustedRef.current = false;
    fit();
  }

  function changeZoom(multiplier: number) {
    userAdjustedRef.current = true;
    setScale((current) => Math.min(1.5, Math.max(fitScale, current * multiplier)));
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { point: { x: event.clientX, y: event.clientY }, pan };
    setIsDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;
    userAdjustedRef.current = true;
    setPan({
      x: dragStart.pan.x + event.clientX - dragStart.point.x,
      y: dragStart.pan.y + event.clientY - dragStart.point.y,
    });
  }

  function endDrag() {
    dragStartRef.current = null;
    setIsDragging(false);
  }

  return (
    <div
      ref={viewportRef}
      className={`relative h-[min(75vh,52rem)] min-h-[24rem] w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated/40 select-none ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-surface px-1.5 py-1 shadow-lg">
        <button type="button" onClick={() => changeZoom(1 / 1.25)} className="btn-ghost !p-1.5" aria-label="Zoom out" title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button type="button" onClick={() => changeZoom(1.25)} className="btn-ghost !p-1.5" aria-label="Zoom in" title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <span className="min-w-10 text-center text-xs font-semibold text-muted">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={applyFit} className="btn-ghost !p-1.5" aria-label="Fit bracket to screen" title="Fit to screen">
          <Maximize2 size={16} />
        </button>
        <button type="button" onClick={applyFit} className="btn-ghost !p-1.5" aria-label="Reset bracket view" title="Reset view">
          <RotateCcw size={16} />
        </button>
      </div>

      <div
        ref={contentRef}
        className="absolute top-0 left-0 p-4"
        style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
      <p className="pointer-events-none absolute right-4 bottom-3 z-10 rounded bg-surface/90 px-2 py-1 text-xs text-muted">
        Drag to explore · use Fit to see the full bracket
      </p>
    </div>
  );
}
