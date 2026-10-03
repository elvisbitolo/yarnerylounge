import { Sparkles, Crown, Gem } from "lucide-react";

// Resolves the semantic icon name carried by TIER_BADGE (plans.js) to a
// lucide-react component, so server and client both render the same glyph. A
// name with no mapping renders nothing rather than a broken box.
const ICONS = {
  sparkles: Sparkles,
  crown: Crown,
  gem: Gem,
};

export default function TierIcon({ name, size = 14, ...rest }) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return <Icon size={size} aria-hidden="true" focusable="false" {...rest} />;
}
