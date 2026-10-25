'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function AdminSurface({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const label = () =>
      root.current?.querySelectorAll('table').forEach((table) => {
        const headings = Array.from(
          table.querySelectorAll('thead th'),
          (th) => th.textContent || '',
        );
        table.querySelectorAll('tbody tr').forEach((row) =>
          Array.from(row.children).forEach((cell, index) => {
            if (cell.tagName === 'TD' && cell.getAttribute('colspan') === null)
              cell.setAttribute('data-label', headings[index] || '');
          }),
        );
      });
    label();
    const observer = new MutationObserver(label);
    if (root.current)
      observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return (
    <div className="admin-surface" ref={root}>
      {children}
    </div>
  );
}
