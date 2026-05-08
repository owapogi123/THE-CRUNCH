import { useIsMobile as useSharedIsMobile } from "./use-tablet"

export function useIsMobile() {
  return useSharedIsMobile()
}
