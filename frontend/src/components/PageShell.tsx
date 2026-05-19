import type { ReactNode } from "react";

/** Contenedor estándar de páginas (mismo ritmo vertical que e-CF). */
export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full space-y-4 sm:space-y-6 px-4 sm:px-0 pt-4 sm:pt-5">{children}</div>
  );
}
