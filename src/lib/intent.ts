import { useEffect, useRef } from "react";

// Наміри через хеш: #/infra/hosts?new — сторінка відкриває форму створення.
// Так верхня панель і палітра команд можуть запускати дії на будь-якій сторінці.

function take(key: string): boolean {
  const [path, query] = location.hash.split("?");
  if (!query) return false;
  const params = new URLSearchParams(query);
  if (!params.has(key)) return false;
  history.replaceState(null, "", `${location.pathname}${location.search}${path}`);
  return true;
}

export function useIntent(key: string, run: () => void) {
  const ref = useRef(run);
  ref.current = run;
  useEffect(() => {
    const check = () => take(key) && ref.current();
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [key]);
}
