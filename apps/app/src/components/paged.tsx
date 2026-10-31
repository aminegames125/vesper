import { type ReactNode, useEffect, useRef, useState } from "react";

/** Renders a long list in pages that grow as the viewer scrolls, so thousands of items never hit the DOM at once. */
export function Paged<T extends { id: string }>({
  items,
  render,
  pageSize = 60,
  minWidth = "14rem",
  list = false,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  pageSize?: number;
  minWidth?: string;
  list?: boolean;
}) {
  const [shown, setShown] = useState(pageSize);
  const sentinel = useRef<HTMLDivElement>(null);

  // A new list (filter changed) starts from the top again.
  useEffect(() => setShown(pageSize), [items, pageSize]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + pageSize);
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, items.length, pageSize]);

  return (
    <>
      <div
        className={list ? "flex flex-col gap-0.5" : "grid gap-4"}
        style={
          list ? undefined : { gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))` }
        }
      >
        {items.slice(0, shown).map((item) => (
          <div key={item.id} className={list ? undefined : "cv-auto"}>
            {render(item)}
          </div>
        ))}
      </div>
      {shown < items.length && <div ref={sentinel} className="h-10" />}
    </>
  );
}
