import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { NAV_ITEMS } from "../../shared/constants/product";
import { Button } from "../../shared/components/ui/Button";
import { initials } from "../../shared/utils/format";

export function AppLayout({
  activePage,
  onPageChange,
  children,
  userLabel,
  isGuest,
  onSignOut,
  theme,
  onThemeToggle,
  mobileNavOpen,
  setMobileNavOpen,
}) {
  const logoSrc = theme === "light" ? "/JobPilotLogoBlue.png" : "/JobPilotLogo.png";

  function selectPage(pageId) {
    onPageChange(pageId);
    setMobileNavOpen(false);
  }

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-main">
        Skip to main content
      </a>
      <aside className={`workspace-sidebar ${mobileNavOpen ? "is-open" : ""}`} aria-label="Primary navigation">
        <div className="brand-block">
          <img className="brand-block__logo" src={logoSrc} alt="" />
          <div>
            <p className="brand-block__name">JobPilot</p>
            <p className="brand-block__tagline">AI-assisted job search</p>
          </div>
          <button className="mobile-close" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="nav-stack">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${active ? "is-active" : ""}`}
                onClick={() => selectPage(item.id)}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="nav-item__icon" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">
            {initials(userLabel)}
          </span>
          <div>
            <p>{userLabel}</p>
            <span>{isGuest ? "Guest workspace" : "Signed in"}</span>
          </div>
        </div>
      </aside>

      {mobileNavOpen ? <button className="mobile-scrim" type="button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} /> : null}

      <div className="workspace-main-wrap">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">JobPilot workspace</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activePage)?.label || "Home"}</h1>
          </div>
          <div className="topbar__actions">
            <Button type="button" variant="ghost" size="sm" onClick={onThemeToggle} aria-label="Toggle color theme">
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              <span className="hide-sm">{theme === "light" ? "Dark" : "Light"}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut size={16} />
              <span className="hide-sm">Sign out</span>
            </Button>
          </div>
        </header>
        <main id="workspace-main" className="workspace-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
