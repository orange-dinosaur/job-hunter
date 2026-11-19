import type { MouseEvent, ReactNode } from "react";

export const navItems = [
  { path: "/", label: "Offers" },
  { path: "/agent", label: "AI Agent" },
  { path: "/cv", label: "CV" },
  { path: "/profile", label: "Search profile" },
  { path: "/pipeline", label: "Pipeline" },
];

export function Layout(props: {
  path: string;
  navigate: (path: string) => void;
  children: ReactNode;
}) {
  // The Offers item stays current on an offer's detail page.
  const current = (p: string) =>
    p === "/"
      ? props.path === "/" || props.path.startsWith("/offers/")
      : props.path.startsWith(p);

  const follow = (e: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    props.navigate(path);
  };

  return (
    <>
      <nav>
        {navItems.map((item) => (
          <a
            key={item.path}
            href={item.path}
            aria-current={current(item.path) ? "page" : undefined}
            onClick={(e) => follow(e, item.path)}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <main>
        <div className="page">{props.children}</div>
      </main>
    </>
  );
}
