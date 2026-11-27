import test from "node:test";
import assert from "node:assert/strict";
import {
  draftBlocksFor,
  emptySitePagesManifest,
  isDraftUnpublished,
  parseSitePagesManifest,
  publishSitePageState,
  publishedBlocksFor,
  saveDraftSitePageState,
  serializeSitePagesManifest,
} from "../site-pages-core.js";

const published = [{ id: "live", type: "paragraph", text: "Live copy", lead: false }];
const draft = [{ id: "next", type: "paragraph", text: "Draft copy", lead: false }];
const actor = { uid: "u1", name: "Editor", email: "editor@example.com" };
const now = "2026-11-26T12:00:00.000Z";

test("parseSitePagesManifest tolerates garbage and unknown slugs", () => {
  assert.deepEqual(parseSitePagesManifest("not json"), emptySitePagesManifest());
  assert.deepEqual(parseSitePagesManifest(null), emptySitePagesManifest());
  const parsed = parseSitePagesManifest({
    pages: {
      about: { published, draft: "not-an-array" },
      unknown: { published: [{ id: "x", type: "paragraph", text: "x" }] },
    },
  });
  assert.deepEqual(Object.keys(parsed.pages), ["about"]);
  assert.equal(parsed.pages.about.draft, null);
});

test("parseSitePagesManifest revalidates stored blocks and link targets", () => {
  const parsed = parseSitePagesManifest({
    pages: {
      about: {
        published: [
          { id: "ok", type: "link", label: "Join", href: "/signup" },
          { id: "bad", type: "link", label: "Bad", href: "javascript:alert(1)" },
          { id: "x", type: "unknown" },
        ],
      },
    },
  });
  assert.deepEqual(parsed.pages.about.published.map((block) => block.id), ["ok"]);
});

test("saveDraftSitePageState never changes published blocks", () => {
  const initial = parseSitePagesManifest({ pages: { about: { published } } });
  const saved = saveDraftSitePageState(initial, "about", draft, actor, now);
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.state.pages.about.published, published);
  assert.deepEqual(saved.state.pages.about.draft, draft);
  assert.equal(saved.state.pages.about.updatedBy, "Editor");
  assert.equal(saved.state.pages.about.updatedAt, now);
  assert.equal(isDraftUnpublished(saved.state.pages.about), true);
  assert.equal(publishedBlocksFor(saved.state, "about")[0].text, "Live copy");
  assert.equal(draftBlocksFor(saved.state, "about")[0].text, "Draft copy");
});

test("publishSitePageState copies the draft only on explicit publish", () => {
  const initial = parseSitePagesManifest({ pages: { about: { published } } });
  const saved = saveDraftSitePageState(initial, "about", draft, actor, now);
  assert.equal(publishedBlocksFor(initial, "about")[0].text, "Live copy");

  const publishedState = publishSitePageState(saved.state, "about", actor, now);
  assert.equal(publishedState.ok, true);
  assert.deepEqual(publishedState.state.pages.about.published, draft);
  assert.equal(publishedState.state.pages.about.publishedBy, "Editor");
  assert.equal(isDraftUnpublished(publishedState.state.pages.about), false);
  assert.equal(publishedBlocksFor(publishedState.state, "about")[0].text, "Draft copy");
});

test("a later draft edit leaves the just-published copy live", () => {
  const saved = saveDraftSitePageState(emptySitePagesManifest(), "about", draft, actor, now);
  const publishedState = publishSitePageState(saved.state, "about", actor, now);
  const nextDraft = [{ id: "later", type: "paragraph", text: "Later draft", lead: false }];
  const edited = saveDraftSitePageState(publishedState.state, "about", nextDraft, actor, now);
  assert.deepEqual(edited.state.pages.about.published, draft);
  assert.deepEqual(edited.state.pages.about.draft, nextDraft);
});

test("publish rejects a missing or empty draft and unknown slugs", () => {
  assert.equal(publishSitePageState(emptySitePagesManifest(), "about", actor).reason, "no-draft");
  assert.equal(saveDraftSitePageState(emptySitePagesManifest(), "about", [], actor).reason, "empty-page");
  assert.equal(saveDraftSitePageState(emptySitePagesManifest(), "nope", draft, actor).status, 400);
  assert.equal(publishSitePageState(emptySitePagesManifest(), "nope", actor).status, 400);
});

test("manifest serialization round-trips and falls back to the built-in copy", () => {
  const state = emptySitePagesManifest();
  assert.equal(publishedBlocksFor(state, "about")[0].text, "About Secret Yarnery");
  assert.equal(draftBlocksFor(state, "about")[0].text, "About Secret Yarnery");
  const saved = saveDraftSitePageState(state, "about", draft, actor, now);
  const parsed = parseSitePagesManifest(serializeSitePagesManifest(saved.state));
  assert.deepEqual(parsed.pages.about.draft, draft);
});
