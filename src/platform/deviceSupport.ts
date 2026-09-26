export interface DeviceSignals {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
  readonly userAgentDataMobile?: boolean | undefined;
}

export interface DeviceSupport {
  readonly supported: boolean;
  readonly reason?: 'mobile-device';
}

type NavigatorWithUserAgentData = Navigator & {
  readonly userAgentData?: { readonly mobile?: boolean };
};

const MOBILE_USER_AGENT =
  /Android|iPhone|iPad|iPod|IEMobile|Windows Phone|Opera Mini|Silk|Kindle|KF[A-Z]{2,}/i;

/**
 * Mobile phones and tablets are blocked until the game has complete touch controls. Width and
 * coarse-pointer checks are deliberately excluded so narrow desktop windows and touch laptops
 * remain supported.
 */
export function detectDeviceSupport(signals: DeviceSignals): DeviceSupport {
  const isIPadOsDesktopUserAgent =
    signals.platform === 'MacIntel' && signals.maxTouchPoints > 1;
  const isMobileDevice =
    signals.userAgentDataMobile === true ||
    MOBILE_USER_AGENT.test(signals.userAgent) ||
    isIPadOsDesktopUserAgent;

  return isMobileDevice ? { supported: false, reason: 'mobile-device' } : { supported: true };
}

export function detectCurrentDeviceSupport(navigatorLike: Navigator = navigator): DeviceSupport {
  const extendedNavigator = navigatorLike as NavigatorWithUserAgentData;
  return detectDeviceSupport({
    userAgent: navigatorLike.userAgent,
    platform: navigatorLike.platform,
    maxTouchPoints: navigatorLike.maxTouchPoints,
    userAgentDataMobile: extendedNavigator.userAgentData?.mobile,
  });
}
