import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/server/auth";
import SignupForm from "./SignupForm";

// Server shell for the sign-up page. Two facts the client cannot know on its
// own are resolved here, so the very first paint is already the right screen:
//
//   oauthPending — we're on the Google OAuth return leg (?provider=google).
//     useSyncExternalStore can't do this: it uses the *server* snapshot for the
//     hydration render, so the form used to be in the SSR HTML and flashed
//     before the client swapped in the signing-in state.
//   hasSession   — the httpOnly session cookie exists, i.e. this is a returning
//     member who will be bounced into the app by the auth wall. The sign-up form
//     must not appear while that check runs.
export default async function SignupPage({ searchParams }) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);

  return (
    <SignupForm
      oauthPending={Boolean(params?.provider)}
      hasSession={Boolean(cookieStore.get(AUTH_COOKIE)?.value)}
    />
  );
}
