'use client';
import { Palette } from 'lucide-react';
import type { Profile } from '@/lib/community';
import { Avatar, Pin, UserTag } from '../context';
import { Art, type Cosmetic } from './shared';

export function CosmeticVisual({
  item,
  user,
}: {
  item: Cosmetic;
  user: Profile;
}) {
  if (item.kind === 'frame')
    return (
      <div className={`hub-frame-preview profile-frame-${item.slug}`}>
        <Avatar avatar={user.avatar} theme={user.theme} />
      </div>
    );
  if (item.kind === 'pin')
    return (
      <div className="hub-pin-preview">
        <Pin id={item.slug} />
      </div>
    );
  if (item.kind === 'tag')
    return (
      <div className="hub-tag-preview">
        <UserTag id={item.slug} />
      </div>
    );
  if (item.image) return <Art src={item.image} />;
  return <Palette size={36} aria-hidden="true" />;
}
