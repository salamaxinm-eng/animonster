'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function AnimeDescription({ text }: { text?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const description = text?.replace(/<[^>]*>/g, '').trim();

  useEffect(() => {
    const node = paragraph.current;
    if (!node || expanded) return;
    const measure = () => setOverflow(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [description, expanded]);

  if (!description) return null;
  return <div className="anime-description">
    <p ref={paragraph} id={id} className={`title-description${expanded ? ' is-expanded' : ''}`}>{description}</p>
    {(overflow || expanded) && <button type="button" className="anime-description-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      {expanded ? 'Свернуть' : 'Читать полностью'}<ChevronDown size={16} aria-hidden="true" />
    </button>}
  </div>;
}
