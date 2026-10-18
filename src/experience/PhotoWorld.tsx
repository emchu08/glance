import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ScanLine } from 'lucide-react';
import { photoLayout, photos, photoTargets, smooth, type LoadedPhoto } from './photos';
import type { State } from './state';

type Props = { photo: LoadedPhoto | null; state: State; reduced: boolean; onSelect: (id: string) => void };
export default function PhotoWorld({ photo, state: s, reduced, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useLayoutEffect(() => {
    const element = ref.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const layout = photoLayout(photo?.id ?? 'grocery', size.width, size.height);
  const visible = !!photo && s.entry > .72;
  const interactive = s.entry >= .999 && !s.drawer && !['summary', 'navigating'].includes(s.phase);
  const targets = photo ? photoTargets[photo.id] ?? [] : [];
  return <div ref={ref} className={`photo-world ${s.entry >= .999 ? 'photo-entered' : ''}`} data-photo={photo?.id} aria-hidden={!visible} style={{ opacity: !photo ? 0 : reduced ? (s.entry >= .999 ? 1 : 0) : smooth(s.entry, .76, .96), pointerEvents: interactive ? 'auto' : 'none' }}>
    {photo && <div className="photo-frame" style={layout.region}>
      <img key={photo.src} className="scene-photo" src={photo.src} alt={photos[photo.id].alt} draggable={false} style={{ width: layout.width, height: layout.height, left: layout.left, top: layout.top }} />
      <div className="photo-light-shade" />
      {interactive && targets.map(target => {
        const [x, y, width, height] = target.rect;
        const selected = s.selected === target.id;
        return <button key={target.id} data-target={target.id} data-bounds={target.rect.join(',')} aria-label={target.label} aria-pressed={selected} className={`photo-target ${selected ? 'has-focus' : ''} ${selected && s.recognition === 'scanning' ? 'scanning' : ''}`} onClick={() => onSelect(target.id)} style={{ left: layout.left + x * layout.width, top: layout.top + y * layout.height, width: width * layout.width, height: height * layout.height }}>
          <i/><i/><i/><i/><span className="target-number">{target.id === 'zero' ? '02' : '01'}</span>
          {selected && <span className="target-status">{s.recognition === 'scanning' ? <ScanLine size={12}/> : <Check size={12}/>} {s.recognition === 'scanning' ? 'LOOKING CLOSER' : 'IN FOCUS'}</span>}
        </button>;
      })}
      {photo.id === 'aisle' && s.phase === 'navigating' && <svg className="floor-route" aria-label="Illustrative route along the aisle floor" viewBox="0 0 1200 900" style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}>
        <path className="route-trail" d="M 510 890 Q 563 746 577 637 Q 583 595 596 577" fill="none" stroke="white" strokeWidth="4" strokeDasharray="9 14" opacity=".7"/>
        {[0, 1, 2, 3].map(i => <path key={i} className="route-chevron" style={{ '--route-delay': `${i * .25}s` } as CSSProperties} d={['M 435 855 L 530 813 L 612 861 L 596 877 L 529 839 L 451 872 Z', 'M 505 766 L 554 738 L 598 765 L 589 775 L 554 753 L 515 776 Z', 'M 542 701 L 567 683 L 591 700 L 586 707 L 567 695 L 547 708 Z', 'M 566 644 L 581 632 L 595 644 L 591 649 L 581 641 L 570 649 Z'][i]} fill="#a6d2ff" stroke="#336bcc" strokeWidth="1" />)}
      </svg>}
    </div>}
  </div>;
}
