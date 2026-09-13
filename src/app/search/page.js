import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { searchCommunity } from "@/lib/server/search";
import Nav from "@/components/Nav";
import SearchBoard from "./SearchBoard";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const q = params.q || "";
  const hashtag = params.hashtag || "";
  const type = params.type || "";
  const spaceId = params.spaceId || "";
  const initialResults =
    q || hashtag
      ? await searchCommunity({ q, hashtag, type, spaceId }, user.uid)
      : null;

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Search</h1>
        <p className={styles.subtitle}>
          Find posts, members, spaces, groups, courses, events and live lounges.
        </p>
        <SearchBoard
          initialQ={q}
          initialHashtag={hashtag}
          initialType={type}
          initialSpaceId={spaceId}
          initialResults={initialResults}
        />
      </div>
</Nav>
  );
}
