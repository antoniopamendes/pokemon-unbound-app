import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { CloudSyncControls } from "./CloudSyncControls";
import type { CloudSyncApi } from "./useCloudSync";

type AppTopbarProps = {
  title: string;
  subtitle: string;
  cloudSync: CloudSyncApi;
  topbarRef?: RefObject<HTMLElement>;
};

export function AppTopbar({ title, subtitle, cloudSync, topbarRef }: AppTopbarProps) {
  const [accountEmail, setAccountEmail] = useState("");
  const [signInOpen, setSignInOpen] = useState(false);
  const accountAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!signInOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!accountAreaRef.current?.contains(target)) setSignInOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSignInOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [signInOpen]);

  const accountSignInForm = cloudSync.magicLinkSent ? (
    <p className="account-hint">Check <strong>{accountEmail}</strong> for a magic sign-in link.</p>
  ) : (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (accountEmail.trim()) void cloudSync.signInWithEmail(accountEmail.trim());
      }}
    >
      <label className="account-email-label">
        Email
        <input
          type="email"
          required
          value={accountEmail}
          onChange={(event) => setAccountEmail(event.target.value)}
          placeholder="you@example.com"
        />
      </label>
      <button type="submit" className="account-btn account-btn-primary">Send magic link</button>
    </form>
  );

  return (
    <header ref={topbarRef} className="app-topbar">
      <div className="app-topbar-inner">
        <div className="app-topbar-heading">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>

        {cloudSync.isCloudEnabled ? (
          <div ref={accountAreaRef} className="app-topbar-account">
            {cloudSync.user ? (
              <>
                <span className="account-email" title={cloudSync.user.email ?? ""}>{cloudSync.user.email}</span>
                <CloudSyncControls cloudSync={cloudSync} />
                <button type="button" className="account-btn" onClick={() => void cloudSync.signOut()}>Sign out</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="account-btn account-btn-primary"
                  aria-expanded={signInOpen}
                  onClick={() => setSignInOpen((current) => !current)}
                >
                  Sign in to sync
                </button>
                {signInOpen ? (
                  <div className="app-topbar-account-panel">
                    {accountSignInForm}
                    {cloudSync.authError ? <p className="account-error">{cloudSync.authError}</p> : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
