import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOpenFileAt } from '@/hooks/use-open-file-at';
import { useAppearanceStore } from '@stores/appearance-store';
import { useEditorStore } from '@stores/editor-store';
import { useUiStore } from '@stores/ui-store';

const resolved = vi.hoisted(() => ({ value: [{ relPath: 'src/fees/validator.ts', rootKey: 'wt' }] as unknown[] }));
vi.mock('@lib/explorer/fs-client', () => ({ resolvePaths: vi.fn(() => Promise.resolve(resolved.value)) }));

const openFile = vi.fn();
const closeAll = vi.fn();
const revealStage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  resolved.value = [{ relPath: 'src/fees/validator.ts', rootKey: 'wt' }];
  useAppearanceStore.setState({ editorNav: 'tabs' });
  useEditorStore.setState({ openFile, closeAll });
  useUiStore.setState({ revealStage });
});

describe('useOpenFileAt', () => {
  it('resolves under the session, opens at the line and reveals the stage', async () => {
    const { result } = renderHook(() => useOpenFileAt());
    await act(async () => result.current.openPath('proj', 'sess', 'src/fees/validator.ts', { line: 118 }));
    expect(openFile).toHaveBeenCalledWith('proj', 'src/fees/validator.ts', 'sess', 'wt', { line: 118, col: 1 });
    expect(closeAll).not.toHaveBeenCalled();
    expect(revealStage).toHaveBeenCalled();
  });

  it('does nothing for a path main will not serve', async () => {
    resolved.value = [null];
    const { result } = renderHook(() => useOpenFileAt());
    await act(async () => result.current.openPath('proj', undefined, 'nope.ts'));
    expect(openFile).not.toHaveBeenCalled();
  });

  it('closes the others first in single-file mode', () => {
    useAppearanceStore.setState({ editorNav: 'single' });
    const { result } = renderHook(() => useOpenFileAt());
    act(() => result.current.openResolved('proj', undefined, { relPath: 'a.ts' }));
    expect(closeAll).toHaveBeenCalled();
    expect(openFile).toHaveBeenCalledWith('proj', 'a.ts', undefined, undefined, undefined);
  });
});
