import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  useActiveTab,
  useOpenTab,
  usePanelOpen,
  usePickerActions,
  usePickerState,
  usePlace,
  useSelId,
  useSelectPlace,
  useSetSelId,
  useTogglePanel,
  useUiStore,
} from '@stores/ui-store';

/**
 * Every selector hook gets a test. These are thin by design — the value of the
 * convention is that no component ever reaches for the store object, so the
 * hooks are the API surface and are worth pinning.
 */
describe('ui-store selectors', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('useActiveTab and useOpenTab drive the center stage', () => {
    const { result } = renderHook(() => ({
      activeTab: useActiveTab(),
      openTab: useOpenTab(),
    }));

    expect(result.current.activeTab).toBe('orch');

    act(() => {
      result.current.openTab('webhooks');
    });

    expect(result.current.activeTab).toBe('webhooks');
  });

  it('usePickerState and usePickerActions drive the overlay', () => {
    const { result } = renderHook(() => ({
      state: usePickerState(),
      actions: usePickerActions(),
    }));

    expect(result.current.state).toEqual({
      picker: false,
      pickerQuery: '',
      pickerTicket: null,
      newModel: 'opus',
      newEffort: 'high',
    });

    act(() => {
      result.current.actions.openPicker();
      result.current.actions.setPickerQuery('nova');
      result.current.actions.setNewModel('sonnet');
      result.current.actions.setNewEffort('max');
    });

    expect(result.current.state).toEqual({
      picker: true,
      pickerQuery: 'nova',
      // The header's entry point — no ticket, and `openPicker` assigns it on
      // every open rather than leaving whatever was there before (HIVE-73).
      pickerTicket: null,
      newModel: 'sonnet',
      newEffort: 'max',
    });

    act(() => {
      result.current.actions.closePicker();
    });

    expect(result.current.state.picker).toBe(false);
  });

  it('useSelId and useSetSelId track the orchestrator table selection', () => {
    const { result } = renderHook(() => ({
      selId: useSelId(),
      setSelId: useSetSelId(),
    }));

    // Nothing is selected on a fresh launch: there is no sensible zeroth row to
    // be on before a fleet exists.
    expect(result.current.selId).toBeNull();

    act(() => {
      result.current.setSelId('webhooks');
    });

    expect(result.current.selId).toBe('webhooks');
  });

  it('usePlace and usePanelOpen re-render only their own consumer (HIVE-195)', () => {
    let placeRenders = 0;
    let panelRenders = 0;
    const place = renderHook(() => {
      placeRenders += 1;
      return { place: usePlace(), selectPlace: useSelectPlace() };
    });
    const panel = renderHook(() => {
      panelRenders += 1;
      return { panelOpen: usePanelOpen(), togglePanel: useTogglePanel() };
    });
    expect(place.result.current.place).toBe('home');

    act(() => panel.result.current.togglePanel());
    expect(panel.result.current.panelOpen).toBe(false);
    expect(placeRenders).toBe(1);

    const before = panelRenders;
    act(() => useUiStore.setState({ place: 'work' }));
    expect(place.result.current.place).toBe('work');
    expect(panelRenders).toBe(before);
  });
});
