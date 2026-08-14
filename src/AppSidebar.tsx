import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";

export type SidebarMode = "expanded" | "collapsed" | "hover";

type AppSidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  sidebarMode: SidebarMode;
  controlsOpen: boolean;
  onNavigate: () => void;
  onSidebarModeChange: (mode: SidebarMode) => void;
  onControlsToggle: () => void;
  onControlsClose: () => void;
  onSidebarMouseEnter: () => void;
  onSidebarMouseLeave: () => void;
  onSidebarFocusChange: (focused: boolean) => void;
};

export function AppSidebar({
  collapsed,
  mobileOpen,
  sidebarMode,
  controlsOpen,
  onNavigate,
  onSidebarModeChange,
  onControlsToggle,
  onControlsClose,
  onSidebarMouseEnter,
  onSidebarMouseLeave,
  onSidebarFocusChange,
}: AppSidebarProps) {
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement>(null);
  const pokedexActive = location.pathname === "/" || location.pathname.startsWith("/pokemon/");

  useEffect(() => {
    if (!controlsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!sidebarRef.current?.contains(target)) onControlsClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onControlsClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [controlsOpen, onControlsClose]);

  const modeOptions: Array<{ value: SidebarMode; label: string; description: string }> = [
    { value: "expanded", label: "Expanded", description: "Always show labels" },
    { value: "collapsed", label: "Collapsed", description: "Show symbols only" },
    { value: "hover", label: "Expand on hover", description: "Expand temporarily" },
  ];

  return (
    <>
      {mobileOpen ? (
        <button type="button" className="app-nav-backdrop" onClick={onNavigate} aria-label="Close navigation" />
      ) : null}
      <aside
        ref={sidebarRef}
        id="app-navigation"
        className={`app-sidebar ${collapsed ? "app-sidebar-collapsed" : ""} ${mobileOpen ? "app-sidebar-mobile-open" : ""}`}
        aria-label="Application navigation"
        onMouseEnter={onSidebarMouseEnter}
        onMouseLeave={onSidebarMouseLeave}
        onFocusCapture={() => onSidebarFocusChange(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!nextTarget || !event.currentTarget.contains(nextTarget)) onSidebarFocusChange(false);
        }}
      >
        <div className="app-sidebar-scroll">
          <nav className="app-navigation-links">
            <NavLink
              to="/"
              end
              onClick={onNavigate}
              className={`app-nav-link ${pokedexActive ? "app-nav-link-active" : ""}`}
              aria-current={pokedexActive ? "page" : undefined}
              title="Pokédex"
            >
              <span className="app-nav-icon" aria-hidden="true">◈</span>
              <span className="app-nav-text">Pokédex</span>
            </NavLink>
            <NavLink
              to="/boxes"
              end
              onClick={onNavigate}
              className={({ isActive }) => `app-nav-link ${isActive ? "app-nav-link-active" : ""}`}
              title="Pokedex Boxes"
            >
              <span className="app-nav-icon" aria-hidden="true">▦</span>
              <span className="app-nav-text">Pokedex Boxes</span>
            </NavLink>
          </nav>
        </div>

        <div className="app-sidebar-controls">
          {controlsOpen ? (
            <div className="app-sidebar-mode-panel" role="radiogroup" aria-label="Sidebar behavior">
              {modeOptions.map((option) => (
                <label key={option.value} className={`app-sidebar-mode-option ${sidebarMode === option.value ? "app-sidebar-mode-option-active" : ""}`}>
                  <input
                    type="radio"
                    name="sidebar-mode"
                    value={option.value}
                    checked={sidebarMode === option.value}
                    onChange={() => onSidebarModeChange(option.value)}
                  />
                  <span className="app-sidebar-mode-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="app-sidebar-controls-toggle"
            onClick={onControlsToggle}
            aria-expanded={controlsOpen}
            aria-haspopup="true"
            aria-label="Sidebar controls"
            title="Sidebar controls"
          >
            <span className="app-sidebar-controls-icon" aria-hidden="true">▤</span>
            <span className="app-sidebar-controls-text">Sidebar</span>
          </button>
        </div>

      </aside>
    </>
  );
}
