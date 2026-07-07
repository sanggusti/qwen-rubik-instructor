import { describe, expect, it } from 'vitest';
import { readingTime, renderPost, rewriteHref, slugifyHeading, stripHeader } from './render';
import { mediaUrls } from './content';

describe('rewriteHref', () => {
	it('rewrites doc-to-doc links to blog slugs', () => {
		expect(rewriteHref('./13-memory-that-outlives-the-browser-turso-with-a-kill-switch.md', 'post')).toBe(
			'/blog/memory-that-outlives-the-browser-turso-with-a-kill-switch'
		);
		expect(rewriteHref('./research/turso-persistent-memory.md', 'post')).toBe(
			'/blog/turso-persistent-memory'
		);
	});

	it('preserves #fragments on doc links', () => {
		expect(rewriteHref('./02-giving-qwen-a-memory.md#the-digest', 'post')).toBe(
			'/blog/giving-qwen-a-memory#the-digest'
		);
	});

	it('resolves ../ links from research docs against the docs root', () => {
		expect(rewriteHref('../06-the-memoryagent-pivot-forgetting-and-mastery.md', 'research')).toBe(
			'/blog/the-memoryagent-pivot-forgetting-and-mastery'
		);
	});

	it('maps images and diagrams to bundled asset URLs', () => {
		expect(rewriteHref('./images/landing-hero.png', 'post')).toBe(mediaUrls['images/landing-hero.png']);
		expect(rewriteHref('./diagrams/01-system-context.png', 'post')).toBe(
			mediaUrls['diagrams/01-system-context.png']
		);
		expect(mediaUrls['images/landing-hero.png']).toBeTruthy();
	});

	it('falls back to the GitHub tree for other relative paths', () => {
		expect(rewriteHref('./diagrams/', 'post')).toBe(
			'https://github.com/sanggusti/qwen-rubik-instructor/tree/main/docs/diagrams'
		);
		expect(rewriteHref('../diagrams/10-physical-cube-scan.drawio', 'research')).toBe(
			'https://github.com/sanggusti/qwen-rubik-instructor/tree/main/docs/diagrams/10-physical-cube-scan.drawio'
		);
	});

	it('leaves absolute URLs and fragments untouched', () => {
		expect(rewriteHref('https://example.com/x', 'post')).toBe('https://example.com/x');
		expect(rewriteHref('#local', 'post')).toBe('#local');
	});
});

describe('slugifyHeading / readingTime', () => {
	it('slugifies headings for anchors', () => {
		expect(slugifyHeading('The digest, in practice')).toBe('the-digest-in-practice');
		expect(slugifyHeading('  Weird — punctuation!  ')).toBe('weird-punctuation');
	});

	it('computes reading time at ~200wpm with a 1-minute floor', () => {
		expect(readingTime('word')).toBe(1);
		expect(readingTime(Array(1000).fill('w').join(' '))).toBe(5);
	});
});

describe('stripHeader', () => {
	it('drops the H1 and the Part byline for series posts', () => {
		const md = '# Title\n\n*Part 2 of a series on things.*\n\nBody starts here.';
		expect(stripHeader(md, 'post')).toBe('Body starts here.');
	});

	it('drops a multi-line byline paragraph', () => {
		const md = '# Title\n\n*Part 17 of the engineering log. Parts [13](./x.md)\nand [14](./y.md) came first.*\n\nBody.';
		expect(stripHeader(md, 'post')).toBe('Body.');
	});

	it('keeps a prose opening paragraph (doc 16 style)', () => {
		const md = '# Title\n\nParts 1–15 tell the story in order.\n\nMore.';
		expect(stripHeader(md, 'post')).toBe('Parts 1–15 tell the story in order.\n\nMore.');
	});

	it('keeps the Status paragraph on research docs', () => {
		const md = '# Title\n\n**Status:** implemented.\n\nBody.';
		expect(stripHeader(md, 'research')).toBe('**Status:** implemented.\n\nBody.');
	});
});

describe('renderPost', () => {
	const slug = 'giving-qwen-a-memory';

	it('gives headings anchor ids', () => {
		const html = renderPost('# T\n\n*Part 2 of x.*\n\n## The Digest, in practice\n\nText.', slug);
		expect(html).toContain('<h2 id="the-digest-in-practice">');
	});

	it('renders images lazily with resolved URLs', () => {
		const html = renderPost('![hero](./images/landing-hero.png)', slug);
		expect(html).toContain(`src="${mediaUrls['images/landing-hero.png']}"`);
		expect(html).toContain('loading="lazy"');
	});

	it('highlights known code fences and escapes unknown ones', () => {
		const ts = renderPost('```ts\nconst x: number = 1;\n```', slug);
		expect(ts).toContain('class="hljs"');
		expect(ts).toContain('hljs-keyword');

		const text = renderPost('```text\na < b\n```', slug);
		expect(text).toContain('a &lt; b');
	});

	it('rewrites internal links and marks external ones', () => {
		const html = renderPost(
			'[next](./03-teaching-correctness-curriculum-and-grounded-qa.md) and [gh](https://github.com)',
			slug
		);
		expect(html).toContain('href="/blog/teaching-correctness-curriculum-and-grounded-qa"');
		expect(html).toContain('href="https://github.com" target="_blank" rel="noreferrer"');
	});
});
