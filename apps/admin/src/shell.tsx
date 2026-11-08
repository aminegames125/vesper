import type { CloudUser, ServerInfo } from "@vesper/cloud-client";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { type ReactNode, useState } from "react";
import { Icon, type IconName } from "./icons";
import { LogoMark } from "./logo";
import { EASE, PAGE, SPRING } from "./motion";
import type { Route, Space } from "./router";

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  /** Only shown on a full server (accounts exist). */
  full?: boolean;
}

export const MANAGE: NavItem[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "users", label: "Users", icon: "users", full: true },
  { id: "invites", label: "Invites", icon: "invite", full: true },
  { id: "library", label: "Library", icon: "film" },
  { id: "downloads", label: "Downloads", icon: "download" },
  { id: "sync", label: "Sync", icon: "sync" },
  { id: "plugins", label: "Plugins", icon: "chip" },
  { id: "activity", label: "Activity", icon: "pulse" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export const WATCH: NavItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "live", label: "Live TV", icon: "live" },
  { id: "library", label: "Library", icon: "library" },
];

/** How many items sit on the phone's tab bar before the rest move under "More". */
const TABS = 4;

export function Shell({
  route,
  go,
  info,
  user,
  isAdmin,
  onSignOut,
  children,
}: {
  route: Route;
  go: (space: Space, page: string) => void;
  info: ServerInfo;
  user: CloudUser;
  isAdmin: boolean;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const lite = info.mode === "lite";
  const items = (route.space === "manage" ? MANAGE : WATCH).filter((i) => !i.full || !lite);
  const [more, setMore] = useState(false);
  const tabs = items.length > TABS + 1 ? items.slice(0, TABS) : items;
  const overflow = items.length > TABS + 1 ? items.slice(TABS) : [];
  const active = (id: string) => route.page === id;

  return (
    <LayoutGroup>
      <div className="flex h-full flex-col sm:flex-row">
        <header className="flex flex-none items-center gap-3 border-b border-line bg-panel px-4 py-2.5 sm:hidden">
          <LogoMark size={24} />
          <span className="font-display text-lg font-bold">Vesper</span>
          {isAdmin && (
            <div className="ml-auto">
              <SpaceSwitch space={route.space} go={go} />
            </div>
          )}
        </header>

        <nav
          aria-label="Main"
          className="z-[var(--z-nav)] hidden w-[var(--rail-w)] flex-none flex-col border-r border-line bg-panel p-3 sm:flex lg:w-[var(--nav-w)] lg:p-4"
        >
          <div className="mb-6 flex items-center gap-3 px-1.5 lg:px-2">
            <LogoMark size={28} animate />
            <div className="hidden lg:block">
              <p className="font-display text-lg font-bold leading-none">Vesper</p>
              <p className="mt-1 text-xs text-muted">
                {lite ? "Lite" : "Cloud"} {info.version}
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="mb-4 hidden lg:block">
              <SpaceSwitch space={route.space} go={go} full />
            </div>
          )}
          {isAdmin && (
            <button
              type="button"
              title={route.space === "manage" ? "Open the viewer" : "Open the admin panel"}
              onClick={() =>
                go(
                  route.space === "manage" ? "watch" : "manage",
                  route.space === "manage" ? "home" : "overview",
                )
              }
              className="mb-3 grid size-11 place-items-center self-center rounded-lg border border-line text-muted hover:text-paper lg:hidden"
            >
              <Icon name={route.space === "manage" ? "play" : "settings"} />
            </button>
          )}

          <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  title={item.label}
                  onClick={() => go(route.space, item.id)}
                  aria-current={active(item.id) ? "page" : undefined}
                  className="relative flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-paper aria-[current=page]:text-paper lg:justify-start"
                >
                  {active(item.id) && (
                    <motion.span
                      layoutId="nav-active"
                      transition={SPRING}
                      className="absolute inset-0 rounded-lg bg-raised"
                    />
                  )}
                  <Icon name={item.icon} className="relative flex-none" size={18} />
                  <span className="relative hidden lg:inline">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>

          {lite ? (
            <p className="hidden border-t border-line pt-3 text-xs text-muted lg:block">
              Lite server: anyone on your network can open this. Use full mode for accounts.
            </p>
          ) : (
            <div className="border-t border-line pt-3">
              <p className="hidden truncate px-2 pb-1 text-sm lg:block">
                {user.username} <span className="text-muted">· {user.role}</span>
              </p>
              <button
                type="button"
                title="Sign out"
                onClick={onSignOut}
                className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-raised hover:text-paper lg:justify-start"
              >
                <Icon name="signout" size={18} />
                <span className="hidden lg:inline">Sign out</span>
              </button>
            </div>
          )}
        </nav>

        <main className="safe-bottom min-w-0 flex-1 overflow-y-auto sm:!pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${route.space}/${route.page}`}
              variants={PAGE}
              initial="initial"
              animate="animate"
              exit="exit"
              className="mx-auto w-full max-w-[72rem] p-[var(--page-pad)]"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] flex border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          {tabs.map((item) => (
            <TabButton
              key={item.id}
              item={item}
              on={active(item.id)}
              onClick={() => go(route.space, item.id)}
            />
          ))}
          {overflow.length > 0 && (
            <TabButton
              item={{ id: "more", label: "More", icon: "more" }}
              on={overflow.some((o) => active(o.id))}
              onClick={() => setMore(true)}
            />
          )}
        </nav>

        <AnimatePresence>
          {more && (
            <>
              <motion.button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-[var(--z-sheet)] bg-black/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMore(false)}
              />
              <motion.div
                role="dialog"
                aria-label="More pages"
                className="fixed inset-x-0 bottom-0 z-[calc(var(--z-sheet)+1)] rounded-t-xl border-t border-line bg-panel p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "110%" }}
                transition={{ duration: 0.34, ease: EASE }}
              >
                <ul>
                  {overflow.map((item) => (
                    <li key={item.id}>
                      <SheetRow
                        icon={item.icon}
                        on={active(item.id)}
                        onClick={() => {
                          setMore(false);
                          go(route.space, item.id);
                        }}
                      >
                        {item.label}
                      </SheetRow>
                    </li>
                  ))}
                  {!lite && (
                    <li>
                      <SheetRow icon="signout" onClick={onSignOut}>
                        Sign out
                      </SheetRow>
                    </li>
                  )}
                </ul>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

function SheetRow({
  icon,
  on = false,
  onClick,
  children,
}: {
  icon: IconName;
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium ${on ? "bg-raised text-paper" : "text-muted"}`}
    >
      <Icon name={icon} size={18} />
      {children}
    </button>
  );
}

function TabButton({ item, on, onClick }: { item: NavItem; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "page" : undefined}
      className="relative flex min-h-[var(--tabbar-h)] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted aria-[current=page]:text-paper"
    >
      {on && (
        <motion.span
          layoutId="tab-active"
          transition={SPRING}
          className="absolute inset-x-3 top-1 bottom-1 rounded-lg bg-raised"
        />
      )}
      <Icon name={item.icon} size={20} className="relative" />
      <span className="relative">{item.label}</span>
    </button>
  );
}

/** Switches between the admin panel and the viewer. */
export function SpaceSwitch({
  space,
  go,
  full = false,
}: {
  space: Space;
  go: (space: Space, page: string) => void;
  full?: boolean;
}) {
  const options: { id: Space; label: string; page: string }[] = [
    { id: "manage", label: "Manage", page: "overview" },
    { id: "watch", label: "Watch", page: "home" },
  ];
  return (
    <div className={`flex rounded-lg bg-sunken p-0.5 ring-1 ring-line ${full ? "w-full" : ""}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => go(o.id, o.page)}
          aria-pressed={space === o.id}
          className={`flex-1 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${space === o.id ? "bg-raised text-paper" : "text-muted hover:text-paper"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
