import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';
import { loadRaw } from '$lib/blog/content';
import { getPost, posts } from '$lib/blog/manifest';

// ssr is off globally, so the prerender crawler can't discover these pages
// from rendered links — enumerate them for adapter-static.
export const entries: EntryGenerator = () => posts.map((p) => ({ slug: p.slug }));

export const load: PageLoad = async ({ params }) => {
	const post = getPost(params.slug);
	if (!post) error(404, 'No such post');
	return { post, md: await loadRaw(post.file) };
};
