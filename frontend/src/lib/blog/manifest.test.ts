import { describe, expect, it } from 'vitest';
import { getPost, posts, prevNext } from './manifest';
import { docFiles } from './content';

describe('blog manifest integrity', () => {
	it('covers exactly the docs on disk (both directions)', () => {
		expect([...posts.map((p) => p.file)].sort()).toEqual([...docFiles].sort());
	});

	it('has unique slugs', () => {
		const slugs = posts.map((p) => p.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it('has parts 1–18 exactly once each, and research entries without parts', () => {
		const parts = posts.filter((p) => p.kind === 'post').map((p) => p.part);
		expect([...parts].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
			Array.from({ length: 18 }, (_, i) => i + 1)
		);
		expect(posts.filter((p) => p.kind === 'research').every((p) => p.part === null)).toBe(true);
	});

	it('features exactly one post: the architecture tour', () => {
		const featured = posts.filter((p) => p.featured);
		expect(featured.map((p) => p.part)).toEqual([16]);
	});

	it('every series post has a chapter', () => {
		expect(posts.filter((p) => p.kind === 'post').every((p) => p.chapter.length > 0)).toBe(true);
	});
});

describe('getPost / prevNext', () => {
	it('looks up by slug', () => {
		expect(getPost('giving-qwen-a-memory')?.part).toBe(2);
		expect(getPost('nope')).toBeUndefined();
	});

	it('walks neighbors within the same kind', () => {
		const first = prevNext('the-critique-verify-before-you-build');
		expect(first.prev).toBeUndefined();
		expect(first.next?.part).toBe(2);

		const last = prevNext('the-cube-in-your-hands-camera-scanning-without-a-vision-bill');
		expect(last.prev?.part).toBe(17);
		expect(last.next).toBeUndefined();

		// Research docs neighbor each other, not part 18.
		const research = prevNext('turso-persistent-memory');
		expect(research.prev?.slug).toBe('physical-cube-camera-play');
		expect(research.next).toBeUndefined();
	});
});
