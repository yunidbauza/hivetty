import { describe, expect, it } from 'vitest';

import { MAX_IMAGE_BYTES } from '../../../electron/shared/fs-contract';
import { POST_ATTACH_FRAME_MAX_BYTES } from '../../../electron/shared/remote-contract';

describe('MAX_IMAGE_BYTES', () => {
  it('a preview at the cap still fits one remote frame, with room for the envelope', () => {
    const dataUrl = 'data:image/webp;base64,'.length + Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
    expect(dataUrl + 64 * 1024).toBeLessThan(POST_ATTACH_FRAME_MAX_BYTES);
  });
});
