'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { HalloweenNavIcon } from '@/components/halloween-nav-icon';
import { UserRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { sections, shortcuts } from './profile-hub/navigation';
import { sectionHref } from './profile-hub/shared';
import { useCommunity } from './context';

export function MobileProfileMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params?.toString() || '';
  const { moderator } = useCommunity();
  const legacy: Record<string, string> = {
    wall: 'overview',
    collection: 'list',
    rewards: 'collection',
    settings: 'settings',
    notifications: 'settings',
  };
  const section =
    pathname === '/profile'
      ? params?.get('section') || legacy[params?.get('tab') || ''] || 'overview'
      : null;
  useEffect(() => setOpen(false), [pathname, query]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={active ? 'active' : ''}
        aria-label="Профиль"
      >
        <HalloweenNavIcon kind="profile"><UserRound aria-hidden="true" /></HalloweenNavIcon>
        <span>Профиль</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="mobile-profile-dropdown"
        side="top"
        align="end"
        sideOffset={12}
        aria-label="Разделы профиля"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Разделы профиля</DropdownMenuLabel>
          {sections.map(([id, label, Icon], index) => (
            <DropdownMenuItem
              key={id}
              render={<Link href={sectionHref(id)} />}
              onClick={() => setOpen(false)}
              className={`${section === id ? 'selected' : ''} ${index === 7 ? 'account-divider' : ''}`}
              aria-current={section === id ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Другие возможности</DropdownMenuLabel>
          {shortcuts.map(([href, label]) => (
            <DropdownMenuItem
              key={href}
              render={<Link href={href} />}
              onClick={() => setOpen(false)}
            >
              {label}
            </DropdownMenuItem>
          ))}
          {moderator && (
            <DropdownMenuItem
              render={<Link href="/admin" />}
              onClick={() => setOpen(false)}
            >
              Администрирование
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
