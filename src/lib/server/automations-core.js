export const AUTOMATION_TRIGGERS = [
  "new_member",
  "new_post",
  "event_rsvp",
  "purchase",
  "checklist_complete",
  "course_completed",
  "space_joined",
  "member_inactive",
  "milestone_reached",
];

export const AUTOMATION_ACTIONS = [
  "create_notification",
  "award_points",
  "add_member_to_space",
  "send_dm",
  "send_push",
];

export const TRIGGER_PLACEHOLDERS = {
  new_member: ["memberName", "memberEmail"],
  new_post: ["authorName", "postText"],
  event_rsvp: ["rsvpName", "eventTitle"],
  purchase: ["memberName", "memberEmail", "itemName", "targetType", "spaceId"],
  checklist_complete: ["memberName", "memberEmail"],
  course_completed: ["memberName", "memberEmail", "courseName", "courseId", "completionDate"],
  space_joined: ["memberName", "memberEmail", "spaceName", "spaceId"],
  member_inactive: ["memberName", "memberEmail", "inactiveDays", "spaceId"],
  milestone_reached: ["memberName", "memberEmail", "milestonePoints", "totalPoints"],
};

export function fillTemplate(template, values = {}) {
  if (typeof template !== "string") return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function normalizeAutomation(body = {}) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const trigger = AUTOMATION_TRIGGERS.includes(body.trigger) ? body.trigger : "";
  const action = AUTOMATION_ACTIONS.includes(body.action) ? body.action : "";
  const config = body.config && typeof body.config === "object" ? { ...body.config } : {};
  return { name, trigger, action, config };
}
