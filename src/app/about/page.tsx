import ProfileSection from "@/features/website/profile/components/ProfileSection";
import { getPublicProfile } from "@/features/website/profile/service";

export default async function AboutPage() {
  const profile = await getPublicProfile();

  return (
    <main>
      <h1>About</h1>
      <ProfileSection profile={profile} />
    </main>
  );
}
