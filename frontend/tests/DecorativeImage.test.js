import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DecorativeImage from '../src/components/DecorativeImage';
import Home from '../src/pages/Home';
import Register from '../src/pages/Register';
import { AuthProvider } from '../src/context/AuthContext';
import { getReservations } from '../src/services/reservationService';
import { getZones } from '../src/services/zoneService';

// The screens do not call the real API
jest.mock('../src/services/authService');
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn() }));
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

// #337: a decorative image that is hidden on small screens is not downloaded
// there either. In the tests every imported image is this name
// (tests/mocks/file.js).
const IMAGE = 'test-file-stub';
const BLANK = /^data:image\/gif;base64,/;

const renderAt = (page, path) => render(
    <MemoryRouter initialEntries={[path]}>
        <AuthProvider>{page}</AuthProvider>
    </MemoryRouter>,
);

// The real image only goes in the <source>; the <img> keeps the blank pixel
const sourceOf = (container) => container.querySelector('picture source');
const imagesWithTheFile = (container) => [...container.querySelectorAll('img')].filter((img) => img.getAttribute('src') === IMAGE);

// The download (media of the <source>) and the display (classes of the <img> or
// of its container) must name the same breakpoint. The tests below check both,
// so changing only one of them fails.
const decorativePictures = (container) => [...container.querySelectorAll('picture')];

describe('DecorativeImage (#337)', () => {
    test('the image is only offered from minWidth up; the <img> starts with a blank pixel', () => {
        // Act
        const { container } = render(<DecorativeImage src={IMAGE} minWidth="64rem" />);

        // Assert
        const source = sourceOf(container);
        expect(source).toHaveAttribute('media', '(min-width: 64rem)');
        expect(source).toHaveAttribute('srcset', IMAGE);
        expect(container.querySelector('img').getAttribute('src')).toMatch(BLANK);
    });

    test('it is hidden from screen readers and keeps the classes and the style of the <img>', () => {
        // Act
        const { container } = render(
            <DecorativeImage src={IMAGE} minWidth="48rem" className="hidden lg:block" style={{ height: '120px' }} />
        );

        // Assert
        const img = container.querySelector('img');
        expect(img).toHaveAttribute('alt', '');
        expect(img).toHaveAttribute('aria-hidden', 'true');
        expect(img).toHaveClass('hidden', 'lg:block');
        expect(img).toHaveStyle({ height: '120px' });
    });

    test('the <picture> and the <source> add no box to the layout', () => {
        // Arrange: the picture is display: contents, so without "hidden" the
        // source would be one more item of a flex parent and add one more gap
        const { container } = render(<DecorativeImage src={IMAGE} minWidth="48rem" />);

        // Assert
        expect(container.querySelector('picture')).toHaveClass('contents');
        expect(sourceOf(container)).toHaveClass('hidden');
    });
});

const HOMES = [
    ['a visitor', null],
    ['a user', { id: 'user-1', fullName: 'Laura Gomez', role: 'user' }],
    ['an administrator', { id: 'admin-1', fullName: 'Administrador PARKEA', role: 'admin' }],
];

describe('Screens with a decorative image that phones do not download (#337)', () => {
    beforeEach(() => {
        localStorage.clear();
        getZones.mockReset().mockResolvedValue({ data: { zones: [] } });
        getReservations.mockReset().mockResolvedValue({ data: { reservations: [] } });
    });

    test.each(HOMES)('the home of %s offers the illustration from lg (64rem) up and shows it from lg up', async (_who, user) => {
        // Arrange
        if (user) {
            localStorage.setItem('token', 'test-token');
            localStorage.setItem('user', JSON.stringify(user));
        }

        // Act
        const { container } = renderAt(<Home />, '/');
        await screen.findByRole('heading', { level: 1 });

        // Assert: one illustration, downloaded from 64rem and shown from lg
        const pictures = decorativePictures(container);
        expect(pictures).toHaveLength(1);
        expect(sourceOf(container)).toHaveAttribute('media', '(min-width: 64rem)');
        expect(pictures[0].querySelector('img')).toHaveClass('hidden', 'lg:block');
        expect(imagesWithTheFile(container)).toHaveLength(0);
    });

    test('/register offers the car from md (48rem) up and shows its column from md up', () => {
        // Act
        const { container } = renderAt(<Register />, '/register');

        // Assert: the column of the car is the parent of the <picture>
        const pictures = decorativePictures(container);
        expect(pictures).toHaveLength(1);
        expect(sourceOf(container)).toHaveAttribute('media', '(min-width: 48rem)');
        expect(pictures[0].parentElement).toHaveClass('hidden', 'md:flex');
        // The logo is the only <img> with an image file
        expect(imagesWithTheFile(container)).toHaveLength(1);
        expect(imagesWithTheFile(container)[0]).toHaveAttribute('alt', expect.stringMatching(/PARKEA/i));
    });
});
