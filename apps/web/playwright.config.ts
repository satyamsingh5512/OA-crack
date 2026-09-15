import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', webServer: { command: 'npx vite --port 5173', cwd: '.', reuseExistingServer: true }, use: { baseURL: 'http://localhost:5173' } });
