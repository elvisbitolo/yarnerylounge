"use client";

import { createContext, useContext } from "react";

// Lets a header's own back chevron trigger a slide-out animation of the chat
// panel *before* navigating back to the rail. The slide shell provides the
// handler; components like BackButton consume it when present and fall back to
// plain navigation otherwise.
export const NavigationSlideContext = createContext(null);

export function useNavigationSlide() {
  return useContext(NavigationSlideContext);
}