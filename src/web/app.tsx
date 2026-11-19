import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Layout } from "./layout.tsx";
import { OfferDetailPage } from "./pages/offer-detail.tsx";
import { OffersPage } from "./pages/offers.tsx";

export function pageTitle(path: string): string {
  if (path === "/") return "Offers";
  if (/^\/offers\/[^/]+$/.test(path)) return "Offer detail";
  const titles: Record<string, string> = {
    "/agent": "AI Agent",
    "/cv": "CV",
    "/profile": "Search profile",
    "/pipeline": "Pipeline",
  };
  return titles[path] ?? "Page not found";
}

function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: string) => {
    history.pushState(null, "", to);
    setPath(to);
    document.querySelector("main")?.scrollTo(0, 0);
  };

  const title = pageTitle(path);
  if (title === "Offers")
    return (
      <Layout path={path} navigate={navigate}>
        <OffersPage navigate={navigate} />
      </Layout>
    );
  if (title === "Offer detail")
    return (
      <Layout path={path} navigate={navigate}>
        <OfferDetailPage
          key={path}
          id={path.split("/")[2]!}
          navigate={navigate}
        />
      </Layout>
    );
  return (
    <Layout path={path} navigate={navigate}>
      <h1>{title}</h1>
      <p className="muted">
        {title === "Page not found"
          ? `Nothing at ${path}.`
          : "This page is not built yet."}
      </p>
    </Layout>
  );
}

if (typeof document !== "undefined")
  createRoot(document.getElementById("root")!).render(<App />);
