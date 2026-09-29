"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved === "dark" || (!saved && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  if (!mounted) return <div className="w-9 h-9" />;

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-9 h-9 flex items-center justify-center rounded-xl
                 text-slate-500 dark:text-slate-400
                 hover:bg-slate-100 dark:hover:bg-white/10
                 hover:text-slate-900 dark:hover:text-white
                 transition-colors duration-150"
    >
      {dark ? (
        <Sun className="w-4.5 h-4.5" aria-hidden="true" />
      ) : (
        <Moon className="w-4.5 h-4.5" aria-hidden="true" />
      )}
    </button>
  );
}
