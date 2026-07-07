// Bundles the repo-root docs/ folder into the app at build time.
// Markdown is code-split (one lazy chunk per doc); media resolves to hashed URLs.

const rawDocs = import.meta.glob(
	['../../../../docs/*.md', '../../../../docs/research/*.md', '!../../../../docs/README.md'],
	{ query: '?raw', import: 'default' }
) as Record<string, () => Promise<string>>;

const mediaGlobs = import.meta.glob(
	['../../../../docs/images/*', '../../../../docs/diagrams/*.png'],
	{ query: '?url', import: 'default', eager: true }
) as Record<string, string>;

const DOCS_PREFIX = '../../../../docs/';

/** Keys are docs/-relative paths, e.g. '01-...md', 'research/...md'. */
export const docFiles: string[] = Object.keys(rawDocs).map((k) => k.slice(DOCS_PREFIX.length));

/** Keys are docs/-relative paths, e.g. 'images/landing-hero.png'; values are served URLs. */
export const mediaUrls: Record<string, string> = Object.fromEntries(
	Object.entries(mediaGlobs).map(([k, url]) => [k.slice(DOCS_PREFIX.length), url])
);

/** Load a doc's raw markdown by its docs/-relative path. */
export function loadRaw(file: string): Promise<string> {
	const loader = rawDocs[DOCS_PREFIX + file];
	if (!loader) throw new Error(`Unknown doc: ${file}`);
	return loader();
}
