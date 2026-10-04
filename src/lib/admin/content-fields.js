// Single source of truth for admin-editable text fields.
// Deliberately free of ANY imports so both the server validator and the client
// editor form can share it without pulling server code into the browser.
// Validate with lib/server/admin-content.js - never trust a request body.
export const EDITABLE_FIELDS = {
  event: {
    model: "event",
    label: "Event",
    fields: {
      title: { type: "string", max: 200, required: true },
      description: { type: "text", max: 8000 },
      publicPreview: { type: "boolean" },
    },
  },
  group: {
    model: "group",
    label: "Group",
    fields: {
      name: { type: "string", max: 120, required: true },
      description: { type: "text", max: 2000 },
      sidebarDescription: { type: "string", max: 200 },
      hangoutTag: { type: "string", max: 60 },
    },
  },
  article: {
    model: "article",
    label: "Article",
    fields: {
      title: { type: "string", max: 200, required: true },
      excerpt: { type: "text", max: 1000 },
      content: { type: "text", max: 60000 },
      hashtags: { type: "stringArray", max: 40, items: 12 },
      coverImage: { type: "string", max: 600 },
    },
  },
  lesson: {
    model: "lesson",
    label: "Lesson",
    fields: {
      title: { type: "string", max: 200, required: true },
      body: { type: "text", max: 60000 },
      videoUrl: { type: "string", max: 600 },
    },
  },
  module: {
    model: "module",
    label: "Module",
    fields: {
      title: { type: "string", max: 200, required: true },
    },
  },
  announcement: {
    model: "announcement",
    label: "Announcement",
    fields: {
      title: { type: "string", max: 200, required: true },
      body: { type: "text", max: 8000 },
    },
  },
  question: {
    model: "question",
    label: "Question",
    fields: {
      text: { type: "string", max: 300, required: true },
      spaceName: { type: "string", max: 120 },
      active: { type: "boolean" },
    },
  },
  room: {
    model: "room",
    label: "Lounge",
    fields: {
      name: { type: "string", max: 120, required: true },
      description: { type: "text", max: 2000 },
      vibe: { type: "string", max: 200 },
      rule: { type: "string", max: 200 },
    },
  },
  space: {
    model: "space",
    label: "Space",
    fields: {
      name: { type: "string", max: 120, required: true },
      description: { type: "text", max: 4000 },
    },
  },
};
