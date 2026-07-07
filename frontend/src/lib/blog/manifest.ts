// Hand-written index of the engineering-log docs at repo-root docs/.
// Blurbs are condensed from docs/README.md "The posts"; dates from git history.
// Integrity against the actual files is enforced by manifest.test.ts.

export interface BlogPost {
	slug: string;
	/** Path relative to docs/, e.g. '16-architecture-and-feature-tour.md'. */
	file: string;
	part: number | null;
	title: string;
	blurb: string;
	date: string;
	chapter: string;
	kind: 'post' | 'research';
	featured?: boolean;
}

const CH1 = 'The critique and the core fixes';
const CH2 = 'Debugging the tutor';
const CH3 = 'The rewrite and the player';
const CH4 = 'Memory, challenge, deployment';
const CH5 = 'The tour and the frontier';

export const chapters = [CH1, CH2, CH3, CH4, CH5];

export const posts: BlogPost[] = [
	{
		slug: 'the-critique-verify-before-you-build',
		file: '01-the-critique-verify-before-you-build.md',
		part: 1,
		title: 'The critique: verify before you build',
		blurb:
			'How a confident "the backend is broken" finding turned out to be wrong, why that matters, and the three problems that were actually worth fixing.',
		date: '2026-06-29',
		chapter: CH1,
		kind: 'post'
	},
	{
		slug: 'giving-qwen-a-memory',
		file: '02-giving-qwen-a-memory.md',
		part: 2,
		title: 'Giving Qwen a memory',
		blurb:
			'The system received a learner’s history and used only its length. Capturing real performance signals client-side and feeding a compact digest to the model — without adding a database.',
		date: '2026-06-29',
		chapter: CH1,
		kind: 'post'
	},
	{
		slug: 'teaching-correctness-curriculum-and-grounded-qa',
		file: '03-teaching-correctness-curriculum-and-grounded-qa.md',
		part: 3,
		title: 'Teaching correctness: a verified curriculum and grounded Q&A',
		blurb:
			'A full layer-by-layer curriculum whose every algorithm is machine-verified, and a mid-lesson "ask Qwen" that can’t hallucinate moves.',
		date: '2026-06-29',
		chapter: CH1,
		kind: 'post'
	},
	{
		slug: 'debloating-the-solve-human-followable-moves',
		file: '04-debloating-the-solve-human-followable-moves.md',
		part: 4,
		title: 'De-bloating the solve: making a correct solver human-followable',
		blurb:
			'"Solve my cube" was provably correct and completely unfollowable — 246 moves and 32 whole-cube rotations for a 13-move scramble. Eliminating the rotations by conjugation, verified against the engine.',
		date: '2026-06-29',
		chapter: CH1,
		kind: 'post'
	},
	{
		slug: 'the-stuck-lesson-reproduce-in-the-real-ui',
		file: '05-the-stuck-lesson-reproduce-in-the-real-ui.md',
		part: 5,
		title: 'The stuck lesson: the bug is rarely where the survey says',
		blurb:
			'A code-survey confidently blamed a backend crash that didn’t exist; the real defect was three layout decisions and a CSS-specificity quirk only the browser could reveal.',
		date: '2026-06-29',
		chapter: CH2,
		kind: 'post'
	},
	{
		slug: 'the-memoryagent-pivot-forgetting-and-mastery',
		file: '06-the-memoryagent-pivot-forgetting-and-mastery.md',
		part: 6,
		title: 'The MemoryAgent pivot: teaching the tutor to forget',
		blurb:
			'Held against the MemoryAgent rubric our memory was a log, not a memory. Adding a decay curve, relevance-ranked retrieval, budgeted recall, mastery-before-progression, and a "What I remember" view.',
		date: '2026-06-29',
		chapter: CH2,
		kind: 'post'
	},
	{
		slug: 'the-tutor-that-lied-grading-against-the-cube',
		file: '07-the-tutor-that-lied-grading-against-the-cube.md',
		part: 7,
		title: 'The tutor that lied: grading against the cube, not the move log',
		blurb:
			'A cynical QA pass found the grader checking the learner’s transcript instead of their cube. Gating completion on cube state, with a validator that carries each stage’s target.',
		date: '2026-06-29',
		chapter: CH2,
		kind: 'post'
	},
	{
		slug: 'from-vite-spa-to-sveltekit-a-rewrite-the-engines-made-safe',
		file: '08-from-vite-spa-to-sveltekit-a-rewrite-the-engines-made-safe.md',
		part: 8,
		title: 'From a Vite SPA to SvelteKit: a rewrite the engines made safe',
		blurb:
			'Why the rewrite was cheap — the framework-agnostic cube model and learning engines ported verbatim, so only the skin changed — and the three rocks the post-merge bring-up tripped on.',
		date: '2026-06-30',
		chapter: CH3,
		kind: 'post'
	},
	{
		slug: 'the-narration-that-felt-slow-measure-before-you-fix',
		file: '09-the-narration-that-felt-slow-measure-before-you-fix.md',
		part: 9,
		title: 'The narration that felt slow: measure before you fix',
		blurb:
			'Per-call latency and token logging surfaced two unrelated causes: a reasoning model defaulted-on (~33s/frame) and an SSE stream quietly turned into a wait-for-everything barrier. First beat now lands in ~1s.',
		date: '2026-06-30',
		chapter: CH3,
		kind: 'post'
	},
	{
		slug: 'show-dont-tell-a-reference-cube-seeded-from-facelets',
		file: '10-show-dont-tell-a-reference-cube-seeded-from-facelets.md',
		part: 10,
		title: "Show, don't tell: a reference cube seeded from facelets",
		blurb:
			'A dimmed "Show me how" cube in a floating window — painting stickers instead of solving, with a coordinate→facelet map derived from the engine’s own move cycles and proven against the animator’s geometry.',
		date: '2026-07-01',
		chapter: CH3,
		kind: 'post'
	},
	{
		slug: 'the-feedback-that-rebuilt-the-player',
		file: '11-the-feedback-that-rebuilt-the-player.md',
		part: 11,
		title: "The feedback that rebuilt the player: teach on the reference cube, not the learner's",
		blurb:
			'Two rounds of "watch it in the real UI" took the first cut apart: the walkthrough should drive the reference cube, not the learner’s, with the learner’s cube gated behind explicit actions.',
		date: '2026-07-01',
		chapter: CH3,
		kind: 'post'
	},
	{
		slug: 'playable-and-learnable-e2e-without-the-api-bill',
		file: '12-playable-and-learnable-e2e-without-the-api-bill.md',
		part: 12,
		title: 'Playable and learnable: an E2E suite that plays the whole game (without the API bill)',
		blurb:
			'Running the real stack with the LLM pinned to its deterministic fallback, and a "money test" that scrambles, streams a narrated solve, and asserts the cube actually ends solved.',
		date: '2026-07-02',
		chapter: CH3,
		kind: 'post'
	},
	{
		slug: 'memory-that-outlives-the-browser-turso-with-a-kill-switch',
		file: '13-memory-that-outlives-the-browser-turso-with-a-kill-switch.md',
		part: 13,
		title: 'Memory that outlives the browser: a Turso mirror with a kill switch',
		blurb:
			'The database is a mirror: whole-profile snapshot sync, an empty env var as the kill switch, a client-digest-always-wins precedence rule, and a timed-solve leaderboard.',
		date: '2026-07-03',
		chapter: CH4,
		kind: 'post'
	},
	{
		slug: 'challenge-me-google-auth-and-a-leaderboard-with-a-clock',
		file: '14-challenge-me-google-auth-and-a-leaderboard-with-a-clock.md',
		part: 14,
		title: 'Challenge Me: Google auth and a leaderboard with a clock',
		blurb:
			'Google’s code flow terminated in FastAPI, opaque 30-day tokens, and the cheat that almost shipped: anything the challenge didn’t initiate cancels the run.',
		date: '2026-07-04',
		chapter: CH4,
		kind: 'post'
	},
	{
		slug: 'one-box-three-containers-deploying-to-alibaba-cloud',
		file: '15-one-box-three-containers-deploying-to-alibaba-cloud.md',
		part: 15,
		title: 'One box, three containers: deploying the stack to Alibaba Cloud',
		blurb:
			'Two multi-stage Docker images, a three-service compose file where Caddy owns the only published ports, and a tag-to-deploy pipeline ending in docker compose pull over SSH.',
		date: '2026-07-04',
		chapter: CH4,
		kind: 'post'
	},
	{
		slug: 'architecture-and-feature-tour',
		file: '16-architecture-and-feature-tour.md',
		part: 16,
		title: 'The architecture, drawn — and a tour of everything the app can do',
		blurb:
			'The whole system as eight draw.io diagrams — system context, services, narration pipeline, memory, hints, auth, deployment, data model — and a screenshot tour captured from a live run with real Qwen narration.',
		date: '2026-07-04',
		chapter: CH5,
		kind: 'post',
		featured: true
	},
	{
		slug: 'the-final-review-canvas-replay-your-solve-on-a-real-cube',
		file: '17-the-final-review-canvas-replay-your-solve-on-a-real-cube.md',
		part: 17,
		title: 'The final review canvas: replay your solve on a real cube',
		blurb:
			'Capturing the narrated solve as it streams, a compile step that refuses to render anything it can’t replay to solved, and the landing scrubber reborn as a checkpoint-by-checkpoint tour.',
		date: '2026-07-07',
		chapter: CH5,
		kind: 'post'
	},
	{
		slug: 'the-cube-in-your-hands-camera-scanning-without-a-vision-bill',
		file: '18-the-cube-in-your-hands-camera-scanning-without-a-vision-bill.md',
		part: 18,
		title: 'The cube in your hands: camera scanning without a vision bill',
		blurb:
			'A feasibility audit kills live move-tracking with arithmetic, replaced by scan once / trust-advance / verify at checkpoints — a pure-function CV pipeline built against image fixtures before any camera code.',
		date: '2026-07-07',
		chapter: CH5,
		kind: 'post'
	},
	{
		slug: 'physical-cube-camera-play',
		file: 'research/physical-cube-camera-play.md',
		part: null,
		title: 'Playing with your physical cube: camera scanning, state mapping, and guided tracking',
		blurb:
			'The design note that became Part 18: the three-lens feasibility audit that killed per-move scanning, the vision-stack comparison, and the phased P0–P4 roadmap.',
		date: '2026-07-07',
		chapter: '',
		kind: 'research'
	},
	{
		slug: 'turso-persistent-memory',
		file: 'research/turso-persistent-memory.md',
		part: null,
		title: 'Turso (libSQL) as the persistence layer for learner memory',
		blurb:
			'The design note that became Part 13: the case for Turso and a low-blast-radius design that keeps the browser-local path working as a fallback.',
		date: '2026-07-03',
		chapter: '',
		kind: 'research'
	}
];

export function getPost(slug: string): BlogPost | undefined {
	return posts.find((p) => p.slug === slug);
}

/** Array-order neighbors within the same kind (posts 1..18, or the research pair). */
export function prevNext(slug: string): { prev?: BlogPost; next?: BlogPost } {
	const same = posts.filter((p) => p.kind === getPost(slug)?.kind);
	const i = same.findIndex((p) => p.slug === slug);
	if (i < 0) return {};
	return { prev: same[i - 1], next: same[i + 1] };
}
