import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

export default function Layout() {
    return (
        <div className="flex min-h-screen flex-col">
            {/* #311 (WCAG 2.4.1): the first thing the Tab key reaches. It is only
                seen while it has the focus. */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-label focus:text-parkea-700 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-parkea-600"
            >
                Saltar al contenido
            </a>
            <Header />
            {/* tabIndex -1: the link above can put the focus here */}
            <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
                <Outlet />
            </main>
            <footer>
                <Footer />
            </footer>
        </div>
    );
}
