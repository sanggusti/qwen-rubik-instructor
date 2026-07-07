// Unlike the cube app (client-only SPA, see root +layout.ts), the blog is
// content that should be indexable and readable without JS — override ssr
// back on so adapter-static bakes the rendered markdown into the prerendered
// HTML instead of an empty shell.
export const ssr = true;
