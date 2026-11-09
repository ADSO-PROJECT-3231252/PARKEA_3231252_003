// Runs before every test file.
import { TextEncoder, TextDecoder } from 'node:util';

// Matchers such as toBeInTheDocument()
import '@testing-library/jest-dom';

// React Router needs TextEncoder, which the browser has but jsdom does not.
Object.assign(globalThis, { TextEncoder, TextDecoder });

// src/config.js reads import.meta.env, which only Vite understands. In the
// tests it is replaced by this fixed address (no test calls the real API).
jest.mock('../src/config', () => ({ API_URL: 'http://localhost:3000/api' }));
