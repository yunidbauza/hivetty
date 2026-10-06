import type { FlapTone } from '@/types/pull-request';

/** One utility per tone (HIVE-215): the flap's word, the row's glyph, and Home's counts (HIVE-200). */
export const FLAP_TEXT: Record<FlapTone, string> = {
  muted: 'text-muted',
  green: 'text-green',
  amber: 'text-amber-text',
  brand: 'text-brand',
};
