import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MENU_SURFACE,
} from '@components/ui/dropdown-menu';

function Menu() {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Actions">
        <DropdownMenuItem>Rename</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Remove</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked>Merge unattended</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('draws the one menu surface from the app tokens', () => {
    render(<Menu />);
    expect(screen.getByRole('menu')).toHaveClass(...MENU_SURFACE.split(' '));
  });

  it('highlights an item with bg-active, the step a keyboard user can see', () => {
    render(<Menu />);
    const item = screen.getByRole('menuitem', { name: 'Rename' });
    expect(item).toHaveClass('data-[highlighted]:bg-active', 'data-[highlighted]:text-ink', 'text-muted');
  });

  it('gives the destructive variant red text', () => {
    render(<Menu />);
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveClass('data-[variant=destructive]:text-red');
  });

  it('shares the item recipe with the checkbox item', () => {
    render(<Menu />);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Merge unattended' })).toHaveClass(
      'data-[highlighted]:bg-active',
      'pl-7',
    );
  });
});
