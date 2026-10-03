"use client";
import { useEffect, useRef } from "react";

// Calls fn immediately and then every `ms` milliseconds (default 5 s).
export function usePolling(fn: () => void | Promise<void>, ms = 5000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ref.current();
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
