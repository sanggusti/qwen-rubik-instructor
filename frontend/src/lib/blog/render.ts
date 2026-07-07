// Markdown → HTML for the blog. The docs are first-party content checked into
// this repo, so the output is trusted and rendered with {@html} unsanitized.
import { Marked, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import { getPost, type BlogPost } from './manifest';
import { mediaUrls } from './content';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('yaml', yaml);

const GITHUB_DOCS = 'https://github.com/sanggusti/qwen-rubik-instructor/tree/main/docs';

function escapeHtml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function slugifyHeading(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function readingTime(md: string): number {
	return Math.max(1, Math.round(md.trim().split(/\s+/).length / 200));
}

/**
 * Drop the H1 (the page renders its own title from the manifest) and, for
 * series posts, the italic "*Part N …*" byline paragraph under it. Research
 * docs keep their opening "**Status:**" paragraph.
 */
export function stripHeader(md: string, kind: BlogPost['kind']): string {
	const lines = md.split('\n');
	let i = 0;
	if (lines[i]?.startsWith('# ')) i++;
	while (lines[i]?.trim() === '') i++;
	if (kind === 'post' && lines[i]?.startsWith('*Part ')) {
		while (i < lines.length && lines[i].trim() !== '') i++;
	}
	return lines.slice(i).join('\n').trim();
}

/**
 * Rewrite the docs' relative links for the /blog routes: doc-to-doc .md links
 * become /blog/<slug>, images/diagrams resolve to bundled asset URLs, and
 * anything else relative (e.g. the diagrams/ folder or .drawio sources) falls
 * back to the GitHub tree. Absolute URLs and #fragments pass through.
 */
export function rewriteHref(href: string, kind: BlogPost['kind']): string {
	if (/^(https?:|mailto:|#)/.test(href)) return href;
	let path = href.startsWith('./') ? href.slice(2) : href;
	if (kind === 'research') {
		path = path.startsWith('../') ? path.slice(3) : `research/${path}`;
	}
	const md = path.match(/^((?:research\/)?[^/#]+\.md)(#.*)?$/);
	if (md) {
		const target = getPostByFile(md[1]);
		if (target) return `/blog/${target.slug}${md[2] ?? ''}`;
	}
	if (mediaUrls[path]) return mediaUrls[path];
	return `${GITHUB_DOCS}/${path.replace(/\/$/, '')}`;
}

function getPostByFile(file: string): BlogPost | undefined {
	return getPost(file.replace(/^research\//, '').replace(/^\d+-/, '').replace(/\.md$/, ''));
}

export function renderPost(md: string, slug: string): string {
	const kind = getPost(slug)?.kind ?? 'post';
	const marked = new Marked({
		renderer: {
			heading({ tokens, depth }: Tokens.Heading) {
				const inner = this.parser.parseInline(tokens);
				const id = slugifyHeading(inner.replace(/<[^>]*>/g, ''));
				return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
			},
			link({ href, title, tokens }: Tokens.Link) {
				const target = rewriteHref(href, kind);
				const inner = this.parser.parseInline(tokens);
				const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
				const external = /^https?:/.test(target) ? ' target="_blank" rel="noreferrer"' : '';
				return `<a href="${target}"${titleAttr}${external}>${inner}</a>`;
			},
			image({ href, title, text }: Tokens.Image) {
				const src = rewriteHref(href, kind);
				const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
				return `<img src="${src}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy" decoding="async">`;
			},
			code({ text, lang }: Tokens.Code) {
				const language = lang && hljs.getLanguage(lang) ? lang : undefined;
				const body = language ? hljs.highlight(text, { language }).value : escapeHtml(text);
				return `<pre><code class="hljs">${body}</code></pre>\n`;
			}
		}
	});
	return marked.parse(stripHeader(md, kind), { async: false });
}
