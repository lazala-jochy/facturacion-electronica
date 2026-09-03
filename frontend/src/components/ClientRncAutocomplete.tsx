import { useEffect, useRef, useState } from "react";
import { listClients, type ClientListItem } from "../services/clients";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (client: ClientListItem) => void;
  className: string;
  required?: boolean;
};

/** Autocompleta cliente por RNC/cédula mientras se escribe; al elegir, rellena nombre/dirección/tel/email. */
export default function ClientRncAutocomplete({
  value,
  onChange,
  onSelect,
  className,
  required,
}: Props) {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    listClients()
      .then(({ clients: loaded }) => {
        if (active) setClients(loaded);
      })
      .catch(() => {
        /* sin sugerencias si falla la carga; el campo sigue editable a mano */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const digits = value.replace(/\D/g, "");
  const matches =
    digits.length >= 2
      ? clients
          .filter((c) => c.rnc_cedula.replace(/\D/g, "").includes(digits))
          .sort((a, b) => {
            const aStarts = a.rnc_cedula.replace(/\D/g, "").startsWith(digits) ? 0 : 1;
            const bStarts = b.rnc_cedula.replace(/\D/g, "").startsWith(digits) ? 0 : 1;
            return aStarts - bStarts;
          })
          .slice(0, 8)
      : [];

  const handleSelect = (client: ClientListItem) => {
    onSelect(client);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        required={required}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-300 bg-white text-xs shadow-lg">
          {matches.map((client) => (
            <li key={client.id}>
              <button
                type="button"
                onClick={() => handleSelect(client)}
                className="block w-full px-2 py-1.5 text-left hover:bg-blue-50"
              >
                <span className="font-mono font-medium text-slate-800">{client.rnc_cedula}</span>{" "}
                <span className="text-slate-600">— {client.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
