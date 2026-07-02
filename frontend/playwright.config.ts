import { defineConfig, devices } from '@playwright/test';

// E2E suite for the learner journey. The backend runs in fallback mode: a
// dummy DASHSCOPE_API_KEY (must be non-empty — an empty key crashes OpenAI
// client construction before the fallback guard) with DASHSCOPE_BASE_URL
// pointed at an unroutable address, so every Qwen call fails fast and the
// backend serves deterministic fallback narration over real SSE —
// full-stack coverage with zero API cost.
// Caveat: locally, with reuseExistingServer, a pre-running keyed backend will
// make real Qwen calls; tests still pass (they never assert fallback-vs-real
// narration text).
export default defineConfig({
	testDir: './e2e',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	fullyParallel: true,
	workers: process.env.CI ? 2 : 4,
	retries: process.env.CI ? 2 : 0,
	// The @live spec makes real Qwen calls; opt in with E2E_LIVE=1.
	grepInvert: process.env.E2E_LIVE ? undefined : /@live/,
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'retain-on-failure',
		// Headless chromium needs SwiftShader for the WebGL cube canvas.
		launchOptions: { args: ['--enable-unsafe-swiftshader'] }
	},
	projects: [
		{ name: 'desktop', testIgnore: /mobile\.spec\.ts/ },
		// Real phone emulation (touch, coarse pointer, mobile UA) — a plain
		// viewport resize never shows the touch keypad. Chromium, not the
		// device's default WebKit: only chromium is installed and the
		// SwiftShader flag above is chromium-specific.
		{
			name: 'mobile',
			use: { ...devices['iPhone 13'], browserName: 'chromium' },
			testMatch: /mobile\.spec\.ts/
		}
	],
	webServer: [
		{
			command: '.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000',
			cwd: '../backend',
			url: 'http://127.0.0.1:8000/health',
			reuseExistingServer: !process.env.CI,
			env: { DASHSCOPE_API_KEY: 'e2e-dummy-key', DASHSCOPE_BASE_URL: 'http://127.0.0.1:9' }
		},
		{
			command: 'npm run dev -- --port 5173 --strictPort',
			url: 'http://localhost:5173',
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			// Headless Chromium resolves localhost to ::1 first, but uvicorn above
			// binds IPv4 127.0.0.1 — point the app at the IPv4 address explicitly.
			env: { PUBLIC_BACKEND_URL: 'http://127.0.0.1:8000' }
		}
	]
});
