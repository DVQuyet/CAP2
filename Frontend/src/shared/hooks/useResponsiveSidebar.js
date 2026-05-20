import { useEffect, useState } from "react";

const MOBILE_SIDEBAR_QUERY = "(max-width: 1100px)";

export function useResponsiveSidebar(defaultOpen = true) {
  const getInitialOpen = () => {
    if (typeof window === "undefined") return defaultOpen;
    return !window.matchMedia(MOBILE_SIDEBAR_QUERY).matches;
  };

  const [sidebarOpen, setSidebarOpen] = useState(getInitialOpen);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(MOBILE_SIDEBAR_QUERY);
    const syncSidebar = (event) => {
      setSidebarOpen(!event.matches);
    };

    syncSidebar(mediaQuery);
    mediaQuery.addEventListener?.("change", syncSidebar);

    return () => {
      mediaQuery.removeEventListener?.("change", syncSidebar);
    };
  }, []);

  return [sidebarOpen, setSidebarOpen];
}
