import { Component } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parkea-600 focus-visible:ring-offset-2';

// #315: shown instead of a blank screen when a page fails while it renders
// (for example, data with a shape the page does not expect). Full screen and
// without the Header, like NotFound.jsx, because the Header could be the part
// that failed.
function PageError() {
    const { user } = useAuth();
    const homeLink = user?.role === 'admin' ? '/admin/dashboard' : '/';

    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-10 text-center">
            <title>Algo salió mal | PARKEA</title>
            <div role="alert" className="flex flex-col items-center gap-2">
                <h1 className="font-display text-display text-parkea-700">Algo salió mal</h1>
                <p className="max-w-md text-body text-neutral-700">
                    No pudimos mostrar esta página. Recárgala o vuelve al inicio para seguir usando PARKEA.
                </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className={`flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-5 py-2.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 ${FOCUS_RING}`}
                >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Recargar
                </button>
                {/* The transparent border gives it the height of "Recargar" */}
                <Link
                    to={homeLink}
                    className={`flex items-center gap-2 rounded-md border border-transparent bg-parkea-600 px-5 py-2.5 text-label text-white transition-colors hover:bg-parkea-700 ${FOCUS_RING}`}
                >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    Volver al inicio
                </Link>
            </div>
        </main>
    );
}

// React only catches errors of rendering in a class component. React itself
// already writes the error in the console, so it is not logged again here.
// Errors in event handlers or in requests are not caught here: each page
// already shows its own message for those.
class Boundary extends Component {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    // The screen goes away when the address changes ("Volver al inicio", the
    // back button of the browser). It is only reset when the error was
    // already on screen before this change, not in the same change that
    // caused it; otherwise the broken page would render twice.
    componentDidUpdate(prevProps, prevState) {
        if (this.state.failed && prevState.failed && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ failed: false });
        }
    }

    render() {
        return this.state.failed ? <PageError /> : this.props.children;
    }
}

// location.key changes on every navigation, also when the link goes to the
// same address (the error happened on the home page and the user presses
// "Volver al inicio").
export default function ErrorBoundary({ children }) {
    const location = useLocation();
    return <Boundary resetKey={location.key}>{children}</Boundary>;
}
