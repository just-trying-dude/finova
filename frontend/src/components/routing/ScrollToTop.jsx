import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Reset scroll position on every route change (pathname or query). */
export function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, search]);

  return null;
}
