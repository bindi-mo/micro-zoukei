import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Tauri event module so tests do not require a real Tauri runtime.
vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(),
}));

// Provide a stable window for jsdom-based tests.
if (typeof window !== 'undefined') {
    (window as any).PROXY_PORT = 8080;
}