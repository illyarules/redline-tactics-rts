import { describe, expect, it } from 'vitest';
import { detectDeviceSupport, type DeviceSignals } from '../../src/platform/deviceSupport';

const DESKTOP_SIGNALS: DeviceSignals = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  platform: 'MacIntel',
  maxTouchPoints: 0,
};

describe('device support', () => {
  it.each([
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5],
    ['Android phone', 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit Mobile', 'Linux armv8l', 5],
    ['Android tablet', 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit', 'Linux armv8l', 10],
    ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'iPad', 5],
    ['Kindle', 'Mozilla/5.0 (Linux; U; en-US) AppleWebKit Silk/3.13', 'Linux armv7l', 5],
  ])('blocks %s', (_name, userAgent, platform, maxTouchPoints) => {
    expect(detectDeviceSupport({ userAgent, platform, maxTouchPoints })).toEqual({
      supported: false,
      reason: 'mobile-device',
    });
  });

  it('blocks iPadOS when it presents a desktop-like user agent', () => {
    expect(detectDeviceSupport({ ...DESKTOP_SIGNALS, maxTouchPoints: 5 })).toEqual({
      supported: false,
      reason: 'mobile-device',
    });
  });

  it('uses User-Agent Client Hints when the browser exposes the mobile flag', () => {
    expect(detectDeviceSupport({ ...DESKTOP_SIGNALS, userAgentDataMobile: true }).supported).toBe(false);
  });

  it.each([
    ['macOS desktop', DESKTOP_SIGNALS],
    ['Windows desktop', { ...DESKTOP_SIGNALS, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' }],
    ['Windows touch laptop', { ...DESKTOP_SIGNALS, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 }],
  ])('allows %s', (_name, signals) => {
    expect(detectDeviceSupport(signals)).toEqual({ supported: true });
  });
});
