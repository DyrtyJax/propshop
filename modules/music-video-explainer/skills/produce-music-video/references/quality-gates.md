# Quality gates

Run gates on artifacts, not promises. A deterministic check may block a known defect; it must not choose the most tasteful take.

## Candidate gate

- Preserve every candidate with a stable ID, prompt, provider/model revision, cost, and hash.
- Compare at actual playback speed and at representative display size.
- Reject broken anatomy, identity drift, accidental brands, unwanted glyphs, camera cuts, and content outside the safe frame.
- Let a human choose when the remaining difference is acting, musical taste, humor, or style.

## Music and voice gate

- Listen to the chosen window; ASR agreement is useful but not proof of musical or vocal quality.
- Check lyric intelligibility, pronunciation, phrase endings, musical structure, originality risk, and whether the cut has a deliberate ending or tail.
- Keep stems when they materially help lip sync or editing.
- Measure final true peak. Treat peaks above `-1 dBTP` as a publish-risk warning unless the target platform specifies another limit.
- Check for generated-clip audio leaking under the canonical master.

## Character and motion gate

- Compare the result against the requested realism target, not only against the source frame.
- Check face, silhouette, scale, wardrobe/props, distinctive marks, lighting, and emotional intent.
- Ensure lip-sync processing did not replace the face or flatten the original performance.
- Avoid multiplying a shot route until a short representative spike passes.

## Graphics and factual gate

- Keep labels, citations, maps, charts, and numbers editable.
- Verify each published claim against an identified source and access date.
- Preview on a phone-sized canvas. If primary text cannot be read while the video plays, it fails even if it is technically present.
- Do not shrink caveats or citations until they become ceremonial.
- Mark stylized maps as such and avoid implying precise track geometry when none is shown.

## Rough-cut gate

- Watch the full piece without pausing.
- Check whether shot scale, camera position, and visual energy evolve rather than repeat mechanically.
- Confirm the film communicates through images, not only a performer alternating with slides.
- Verify transitions, title timing, factual density, and the emotional landing.
- Ask for human approval before scaling expensive finals unless the user delegated that choice.

## Delivery gate

Run `scripts/inspect-media.mjs` on the final and inspect its contact sheet. Also:

- decode the full file without errors;
- verify duration, frame rate, dimensions, audio streams, and intended end behavior;
- watch and listen on the target device;
- preserve editable sources, raw generations, decisions, costs, provider IDs, hashes, and rights notes;
- describe limitations plainly.
