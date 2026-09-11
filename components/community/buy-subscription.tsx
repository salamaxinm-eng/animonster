'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export function BuySubscription({ className = 'outline-button' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className={className} onClick={() => setOpen(true)}>Plus · тест</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sign-dialog">
        <DialogTitle>AniMonster Plus · закрытая бета</DialogTitle>
        <DialogDescription>В бете Plus выдаёт администратор тестерам. Оплата отключена, деньги не списываются.</DialogDescription>
        <p className="muted">Plus открывает коллекцию пинов. Доступное качество видео определяется источником.</p>
      </DialogContent>
    </Dialog>
  </>;
}
