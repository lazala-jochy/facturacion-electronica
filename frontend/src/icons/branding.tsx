/** Icono vectorial “empresa / facturación” (sin recurso raster). */
export function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 12h12M10 22V12h4v10M9 6h2M13 10h2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Icono vectorial “perfil de usuario”. */
export function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
