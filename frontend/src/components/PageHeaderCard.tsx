import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type PageHeaderCompany = {
  name: string;
  rnc: string;
};

type Props = {
  title: string;
  description?: ReactNode;
  company?: PageHeaderCompany;
  backLink?: { to: string; label: string };
  stats?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

/** Encabezado de página alineado al bloque superior de e-CF. */
export default function PageHeaderCard({
  title,
  description,
  company,
  backLink,
  stats,
  actions,
  children,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {backLink ? (
        <Link
          to={backLink.to}
          className="inline-block text-xs font-medium text-[#0b57d0] hover:underline mb-2"
        >
          {backLink.label}
        </Link>
      ) : null}
      <h2 className="text-3xl font-extrabold text-[#0b57d0]">{title}</h2>
      {description ? <p className="text-slate-600">{description}</p> : null}
      {stats}
      {company ? (
        <p className="text-xs text-slate-500 mt-1">
          {company.name} · RNC {company.rnc}
        </p>
      ) : null}
      {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
      {children}
    </div>
  );
}
