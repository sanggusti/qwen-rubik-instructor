# The narration that felt slow: measure before you fix

*Part 9 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## A complaint with no instrument

The report was vague and familiar: *Qwen narration takes too long.* The Part-1
rule of this series is **verify before you build** — so the wrong move is to start
optimizing on a hunch. The right move is to measure. Except there was nothing to
measure with: the backend had **zero timing instrumentation** around the LLM
calls. Not a `perf_counter`, not a log line, not a token count. The narration
might be slow in the model, slow in the pipeline, or slow on the wire, and we
couldn't tell which.

So step one wasn't a fix. It was a thermometer.

## Building the thermometer

Every narration goes through one function. Wrapping it to time the call and read
the token usage — which DashScope returns on the OpenAI-compatible response — costs
a few lines and changes no behavior:

```python
def _complete(client, model, messages) -> str:
    t0 = time.perf_counter()
    resp = client.chat.completions.create(
        model=model, messages=messages,
        response_format={"type": "json_object"}, temperature=0.7,
    )
    latency = time.perf_counter() - t0
    usage = getattr(resp, "usage", None)
    log.info(
        "qwen_call model=%s latency=%.2fs prompt_tokens=%s completion_tokens=%s total_tokens=%s",
        model, latency,
        getattr(usage, "prompt_tokens", None),
        getattr(usage, "completion_tokens", None),
        getattr(usage, "total_tokens", None),
    )
    return resp.choices[0].message.content or ""
```

A second log line at the plan level reports the aggregate — how many frames, total
wall-clock, the slowest single frame, and how many fell back to deterministic text.
That's the whole instrument. Backend logs only; no new API surface, no UI metrics
to maintain. Run one lesson and the bottleneck names itself.

## Two findings, both real

**Finding one: the default model is a reasoning model.** The default was
`qwen3.7-plus` — a *reasoning* model that deliberates before it answers, at roughly
**33 seconds per frame**. For one-shot narration of a cube move, that deliberation
buys almost nothing and costs everything. The faster `qwen-plus` answers in about a
second. This was even documented — and defaulted-on anyway, which is how a known
cost becomes a felt problem. Flipping the default is a one-liner:

```python
# config.py
# qwen-plus is fast (~5s/frame); set QWEN_MODEL=qwen3.7-plus for the slower,
# deeper reasoning model (~33s/frame).
qwen_model: str = "qwen-plus"
```

The reasoning model stays one env var away for anyone who wants depth over speed.

**Finding two: the stream wasn't streaming.** This one the thermometer made
obvious and the eye never would. The endpoint is Server-Sent Events; it yields a
`meta` frame instantly, then a beat per narrated frame. So it *looks* incremental.
But the function feeding it did this:

```python
# narrate_plan (before)
with ThreadPoolExecutor(max_workers=workers) as pool:
    results = list(pool.map(lambda pair: run(*pair), enumerate(plan.frames)))
for frame, (narration, used_fallback) in zip(plan.frames, results):
    yield frame, narration, used_fallback
```

`list(pool.map(...))` **blocks until every frame is done** before the first `yield`
ever runs. The frames narrate concurrently — that part was fine — but the generator
materializes the entire plan before emitting anything. So time-to-first-beat
equals time-to-*last*-beat. On the old model, with a multi-frame solve, that's the
learner staring at a spinner for the better part of a minute while a perfectly good
first sentence sits finished in a list, waiting for its slowest sibling.

The fix keeps the concurrency and removes the barrier: submit every frame up front,
then yield each **in frame order as its future resolves**.

```python
# narrate_plan (after)
with ThreadPoolExecutor(max_workers=workers) as pool:
    futures = [pool.submit(run, i, frame) for i, frame in enumerate(plan.frames)]
    for frame, future in zip(plan.frames, futures):
        narration, used_fallback = future.result()
        yield frame, narration, used_fallback
```

Output order is unchanged (the existing "frames stream in order" test still
passes), the pool still runs all six workers at once, but the first beat now leaves
the server the instant frame 0 is ready — not when frame 7 finishes. The frontend
never changed: its typewriter caption already consumed the stream beat-by-beat. It
had simply never been *given* a stream to consume.

## What the thermometer read

With both changes live, a real "Solve my cube" from a scrambled cube logs this:

```text
qwen_call model=qwen-plus latency=0.86s prompt_tokens=343 completion_tokens=22 total_tokens=365
qwen_call model=qwen-plus latency=0.93s prompt_tokens=354 completion_tokens=22 total_tokens=376
…
narrate_plan model=qwen-plus kind=walkthrough frames=7 wall=1.62s slowest_frame=0.93s fallbacks=0/7
```

Seven frames, **1.62 seconds total**, slowest frame 0.93s, **zero fallbacks** — and
because of the streaming fix, the first beat reached the browser at ~0.9s, not at
1.62s. Against the old default that same plan was a multi-batch wait of `7 × ~33s`
worth of reasoning with *nothing* on screen until the end. The two changes
compound: a faster per-call model, and a pipeline that shows you each call the
moment it lands.

`fallbacks=0/7` is its own small proof: the model id is valid and every frame
produced narration that passed the move-grounded validator. The deterministic
fallback — the safety net that lets any single slow or malformed frame degrade to
template text instead of stalling the stream — never had to fire.

## The throughline

This is Part 1's lesson applied to performance: **the survey is not the
measurement.** "Narration is slow" had two unrelated causes — a model choice and a
pipeline barrier — and you could have guessed at one forever without touching the
other. A few lines of `perf_counter` and a token count turned a vague complaint
into two named, fixable bugs. And neither fix was new machinery: one was a default,
one was `submit` instead of `map`. The deterministic skeleton already had the
safety net; all the instrument did was show where the skin was making the learner
wait.
