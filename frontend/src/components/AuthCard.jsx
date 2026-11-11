import logo from '../assets/logo.png';

// HU-30: the card of the email confirmation screens, with the same look as
// the other sign-in screens (Login, ForgotPassword, ResetPassword): logo,
// title and the divider with an icon.
export default function AuthCard({ pageTitle, title, icon: Icon, children }) {
    return (
        <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-10">
            <title>{`${pageTitle} | PARKEA`}</title>
            <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-neutral-200 p-8">
                <div className="flex flex-col items-center mb-6">
                    <img src={logo} alt="PARKEA" className="h-15 w-auto object-contain" />
                    <p className="font-sans text-caption text-parkea-600 mt-1">
                        Reserva tu parqueo, simplifica tu día.
                    </p>
                </div>
                <h1 className="font-display text-title text-neutral-900 uppercase text-center mb-2">
                    {title}
                </h1>
                <div className="flex items-center gap-3 my-4">
                    <div className="h-px flex-1 bg-neutral-200" />
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-parkea-50">
                        <Icon className="h-4 w-4 text-parkea-600" aria-hidden="true" />
                    </span>
                    <div className="h-px flex-1 bg-neutral-200" />
                </div>
                {children}
            </div>
        </main>
    );
}
