import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';
import { button } from './classes';

// Crop a reference photo to a 3:4 portrait before it is uploaded: drag (or use
// the arrow keys) to place the face, zoom with the slider, buttons or mouse wheel.
const FRAME_W = 240;
const FRAME_H = 320;
const OUT_W = 600; // saved size; uploadReferencePhoto shrinks again if needed
const OUT_H = 800;
const MAX_ZOOM = 3;

export const PhotoCropper = ({ file, title, onCancel, onDone }: {
  file: Blob; title: string; onCancel: () => void; onDone: (cropped: Blob) => void;
}) => {
  useEscape(onCancel);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    createImageBitmap(file) // applies the photo's EXIF orientation
      .then((b) => { if (!cancelled) setBitmap(b); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
    };
  }, [file]);
  useEffect(() => frame.current?.focus(), [bitmap]);

  const base = bitmap ? Math.max(FRAME_W / bitmap.width, FRAME_H / bitmap.height) : 1; // "cover" at zoom 1
  const shownW = bitmap ? bitmap.width * base * zoom : FRAME_W;
  const shownH = bitmap ? bitmap.height * base * zoom : FRAME_H;
  // Keep the photo covering the frame.
  const clamp = (o: { x: number; y: number }, w = shownW, h = shownH) => ({
    x: Math.max(-(w - FRAME_W) / 2, Math.min((w - FRAME_W) / 2, o.x)),
    y: Math.max(-(h - FRAME_H) / 2, Math.min((h - FRAME_H) / 2, o.y)),
  });
  const setZoomTo = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    if (bitmap) setOffset((o) => clamp(o, bitmap.width * base * next, bitmap.height * base * next));
  };

  // The photo is drawn onto the frame (no blob: link that could be closed
  // before it loads), sharp on high-density screens.
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas || !bitmap) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = FRAME_W * dpr;
    canvas.height = FRAME_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bitmap, FRAME_W / 2 - shownW / 2 + offset.x, FRAME_H / 2 - shownH / 2 + offset.y, shownW, shownH);
  }, [bitmap, shownW, shownH, offset]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 12;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }));
    } else if (e.key === '+' || e.key === '=') setZoomTo(zoom + 0.2);
    else if (e.key === '-') setZoomTo(zoom - 0.2);
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => setZoomTo(zoom - e.deltaY / 500);

  const applyCrop = async () => {
    if (!bitmap) return;
    const scale = base * zoom;
    const sx = (shownW / 2 - FRAME_W / 2 - offset.x) / scale;
    const sy = (shownH / 2 - FRAME_H / 2 - offset.y) / scale;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    canvas.getContext('2d')!.drawImage(bitmap, sx, sy, FRAME_W / scale, FRAME_H / scale, 0, 0, OUT_W, OUT_H);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    onDone(blob ?? file);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <div className="w-full space-y-4 rounded-t-card bg-white p-5 sm:max-w-sm sm:rounded-card">
        <div>
          <h2 id="crop-title" className="font-display text-xl font-extrabold">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">Drag to place the face in the frame. Zoom in so the face fills most of it.</p>
        </div>
        {failed ? (
          <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">This file can't be opened as a photo. Choose a JPEG or PNG photo.</p>
        ) : (
          <div className="flex justify-center">
            <div ref={frame} tabIndex={0} role="group" aria-label="Photo crop area. Use the arrow keys to move the photo, plus and minus to zoom."
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onKeyDown={onKeyDown} onWheel={onWheel}
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-card bg-gray-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand active:cursor-grabbing"
              style={{ width: FRAME_W, height: FRAME_H }}>
              <canvas ref={preview} data-testid="crop-preview" className="pointer-events-none absolute inset-0 h-full w-full" />
              {/* Face guide */}
              <svg viewBox="0 0 240 320" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                <ellipse cx="120" cy="140" rx="70" ry="92" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="6 6" opacity="0.8" />
              </svg>
            </div>
          </div>
        )}
        {!failed && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setZoomTo(zoom - 0.25)} aria-label="Zoom out" className={button.icon}><Minus size={18} aria-hidden /></button>
            <label className="flex-1">
              <span className="sr-only">Zoom</span>
              <input type="range" min={1} max={MAX_ZOOM} step={0.05} value={zoom} onChange={(e) => setZoomTo(Number(e.target.value))} className="w-full accent-brand" />
            </label>
            <button type="button" onClick={() => setZoomTo(zoom + 0.25)} aria-label="Zoom in" className={button.icon}><Plus size={18} aria-hidden /></button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className={button.secondary}>Cancel</button>
          <button type="button" onClick={applyCrop} disabled={!bitmap} className={button.primary}>Use photo</button>
        </div>
      </div>
    </div>
  );
};
