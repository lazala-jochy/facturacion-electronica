import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Evita pantalla en blanco si una página (p. ej. Clientes) lanza al renderizar. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm">
          <h2 className="text-lg font-semibold">No se pudo mostrar esta pantalla</h2>
          <p className="mt-2 text-sm text-red-800">{this.state.error.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium hover:bg-red-100"
              onClick={() => this.setState({ error: null })}
            >
              Reintentar
            </button>
            <Link
              to="/"
              className="rounded-lg bg-[#0b57d0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0948ad]"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
