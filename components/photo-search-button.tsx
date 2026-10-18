'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Camera, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const PhotoSearch = dynamic(() => import('./photo-search'), {
  ssr: false,
  loading: () => <p role="status">Загружаем поиск…</p>,
});

export function PhotoSearchButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        type="button"
        className="photo-search-trigger"
        aria-label="Поиск аниме по фото"
        title="Поиск аниме по фото"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Camera size={20} aria-hidden="true" />
      </DialogTrigger>
      {open && (
        <DialogContent
          className="photo-search-dialog"
          overlayClassName="photo-search-overlay"
          showCloseButton={false}
        >
          <div className="photo-search-heading">
            <DialogTitle>Поиск аниме по фото</DialogTitle>
            <DialogClose
              className="photo-search-close"
              aria-label="Закрыть поиск по фото"
            >
              <X size={20} aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogDescription>
            Увидел аниме в TikTok? Загрузи скриншот, а мы попробуем его найти.
          </DialogDescription>
          <PhotoSearch />
        </DialogContent>
      )}
    </Dialog>
  );
}
