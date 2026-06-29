// The cube needs WebGL/`window`, has no SEO need, and is meant to run as a
// static, host-embeddable bundle (see docs/plan/revampsvelte.md §3.1) — so
// the whole app is a client-only SPA shell rather than server-rendered.
export const ssr = false;
export const prerender = true;
