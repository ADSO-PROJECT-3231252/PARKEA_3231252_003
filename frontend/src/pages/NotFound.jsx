import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import notFoundImage from '../assets/not-found.png';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parkea-600 focus-visible:ring-offset-2';

// Where the text starts on a landscape screen. The picture is 1185 x 661 and its
// art ends at y = 437, so after "cover" scales it the art ends at
// max(37vw, 66vh). The text starts just below that (39.4vw / 70.5vh), but never
// lower than a text block's height from the bottom of the screen.
const TEXT_TOP = 'min(max(39.4vw, 70.5vh), calc(100vh - 175px))';

// A light halo keeps the text readable if it ever touches the picture.
const TEXT_HALO = { textShadow: '0 0 10px #F1F8F1, 0 0 4px #F1F8F1' };

// Full-screen 404 without the Header (it is a standalone route in AppRoutes).
// The picture is the background; the text and the button stay real, so they
// can be edited and the button works. On a portrait screen (a phone) the
// picture sits on top at full width and the text goes below it, because
// covering a tall screen would crop away the 404.
export default function NotFound() {
    const { user } = useAuth();
    const homeLink = user?.role === 'admin' ? '/admin/dashboard' : '/';

    return (
        <div className="relative flex min-h-screen flex-col items-center bg-[#F1F8F1] px-4 pt-[58vw] text-center landscape:pt-0">
            <img
                src={notFoundImage}
                alt="Un carro verde detrás de un enorme 404 en un parqueadero"
                className="absolute inset-0 h-full w-full object-contain object-top landscape:object-cover"
            />
            <div
                className="relative z-10 flex flex-col items-center gap-2 landscape:absolute landscape:inset-x-0 landscape:top-(--text-top)"
                style={{ '--text-top': TEXT_TOP }}
            >
                <h1 className="font-display text-display text-parkea-700 landscape:text-[2.4rem]" style={TEXT_HALO}>
                    ¡Oops! Página no encontrada
                </h1>
                <p className="max-w-md px-4 text-body text-neutral-700" style={TEXT_HALO}>
                    Parece que el lugar que buscas no está en nuestro parqueadero. Regresa al inicio y sigue tu camino.
                </p>
                <Link
                    to={homeLink}
                    className={`mt-3 flex items-center gap-2 rounded-md bg-parkea-600 px-5 py-2.5 text-label text-white transition-colors hover:bg-parkea-700 ${FOCUS_RING}`}
                >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    Volver al inicio
                </Link>
            </div>
        </div>
    );
}
