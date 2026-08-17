import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import type { SidebarMode } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { useCloudSync } from "./useCloudSync";

export default function AppLayout() {
  const sidebarModeStorageKey = "pokemon-unbound-sidebar-mode";
  const location = useLocation();
  const cloudSync = useCloudSync();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    try {
      const stored = window.localStorage.getItem(sidebarModeStorageKey);
      return stored === "collapsed" || stored === "hover" || stored === "expanded" ? stored : "expanded";
    } catch {
      return "expanded";
    }
  });
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [focusExpanded, setFocusExpanded] = useState(false);
  const [topbarHeight, setTopbarHeight] = useState(64);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  const [canHoverExpand, setCanHoverExpand] = useState(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const wasMobileNavOpen = useRef(false);
  const sidebarPointerInside = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const handleChange = () => {
      setIsMobile(mediaQuery.matches);
      setCanHoverExpand(hoverQuery.matches);
      if (!mediaQuery.matches) setMobileNavOpen(false);
      if (!hoverQuery.matches) {
        setHoverExpanded(false);
        setFocusExpanded(false);
      }
    };
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    hoverQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      hoverQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (wasMobileNavOpen.current && !mobileNavOpen && isMobile) {
      mobileToggleRef.current?.focus();
    }
    wasMobileNavOpen.current = mobileNavOpen;
  }, [mobileNavOpen, isMobile]);

  useEffect(() => {
    try {
      window.localStorage.setItem(sidebarModeStorageKey, sidebarMode);
    } catch {
      // Sidebar mode still works for this session when storage is unavailable.
    }
  }, [sidebarMode]);

  useLayoutEffect(() => {
    const topbar = topbarRef.current;
    if (!topbar) return;
    const updateHeight = () => setTopbarHeight(Math.ceil(topbar.getBoundingClientRect().height));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(topbar);
    return () => observer.disconnect();
  }, []);

  const isBoxes = location.pathname === "/boxes";
  const handleSidebarMouseEnter = () => {
    sidebarPointerInside.current = true;
    if (canHoverExpand && sidebarMode === "hover" && !mobileNavOpen) setHoverExpanded(true);
  };

  const handleSidebarMouseLeave = () => {
    sidebarPointerInside.current = false;
    if (canHoverExpand && sidebarMode === "hover") setHoverExpanded(false);
  };

  const handleSidebarFocusChange = (focused: boolean) => {
    if (canHoverExpand && sidebarMode === "hover") setFocusExpanded(focused);
  };

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode);
    setControlsOpen(false);
    setHoverExpanded(mode === "hover" && sidebarPointerInside.current);
    setFocusExpanded(mode === "hover" && !sidebarPointerInside.current);
  };

  const sidebarExpanded = isMobile
    || sidebarMode === "expanded"
    || controlsOpen
    || (sidebarMode === "hover" && (hoverExpanded || focusExpanded));
  const appLayoutStyle = { "--app-topbar-height": `${topbarHeight}px` } as CSSProperties;

  return (
    <div
      className={`app-layout ${sidebarExpanded ? "" : "app-layout-sidebar-collapsed"} ${mobileNavOpen ? "app-layout-mobile-nav-open" : ""}`}
      style={appLayoutStyle}
    >
      <AppTopbar
        title={isBoxes ? "Pokedex Boxes" : "Pokemon Unbound Tracker"}
        subtitle={isBoxes ? "Store and organize your caught Pokemon, PC-box style." : "Simple Pokedex companion with cached Unbound data."}
        cloudSync={cloudSync}
        topbarRef={topbarRef}
        mobileNavOpen={mobileNavOpen}
        mobileToggleRef={mobileToggleRef}
        onMobileNavOpen={() => setMobileNavOpen(true)}
      />
      <AppSidebar
        collapsed={!sidebarExpanded}
        mobileOpen={mobileNavOpen}
        sidebarMode={sidebarMode}
        controlsOpen={controlsOpen}
        onNavigate={() => setMobileNavOpen(false)}
        onSidebarModeChange={handleSidebarModeChange}
        onControlsToggle={() => setControlsOpen((current) => !current)}
        onControlsClose={() => setControlsOpen(false)}
        onSidebarMouseEnter={handleSidebarMouseEnter}
        onSidebarMouseLeave={handleSidebarMouseLeave}
        onSidebarFocusChange={handleSidebarFocusChange}
      />
      <div className="app-layout-content">
        <Outlet />
      </div>
    </div>
  );
}
