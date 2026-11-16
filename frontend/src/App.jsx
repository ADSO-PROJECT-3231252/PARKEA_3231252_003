import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                {/* #315: a page that fails while it renders shows an error
                    screen instead of a blank page */}
                <ErrorBoundary>
                    <AppRoutes />
                </ErrorBoundary>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
