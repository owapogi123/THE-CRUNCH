import * as React from "react"

const TABLET_BREAKPOINT = 1024
const MOBILE_BREAKPOINT = 768
const PHONE_BREAKPOINT = 480
const SMALL_PHONE_BREAKPOINT = 390
const COMPACT_DESKTOP_BREAKPOINT = 1280

export function useViewport() {
  const [size, setSize] = React.useState<{ width: number; height: number } | undefined>(undefined)

  React.useEffect(() => {
    const onChange = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    onChange()
    window.addEventListener("resize", onChange)
    window.addEventListener("orientationchange", onChange)
    window.visualViewport?.addEventListener("resize", onChange)

    return () => {
      window.removeEventListener("resize", onChange)
      window.removeEventListener("orientationchange", onChange)
      window.visualViewport?.removeEventListener("resize", onChange)
    }
  }, [])

  const safeWidth = size?.width ?? COMPACT_DESKTOP_BREAKPOINT
  const safeHeight = size?.height ?? 900

  return {
    width: safeWidth,
    height: safeHeight,
    isSmallPhone: safeWidth < SMALL_PHONE_BREAKPOINT,
    isPhone: safeWidth < PHONE_BREAKPOINT,
    isNarrowPhone: safeWidth <= 430,
    isMobile: safeWidth < MOBILE_BREAKPOINT,
    isTablet: safeWidth < TABLET_BREAKPOINT,
    isCompactDesktop: safeWidth < COMPACT_DESKTOP_BREAKPOINT,
    isShortViewport: safeHeight < 740,
  }
}

export function useIsTablet() {
  return useViewport().isTablet
}

export function useIsMobile() {
  return useViewport().isMobile
}
