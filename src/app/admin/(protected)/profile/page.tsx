import ProfileForm from "@/features/cms/profile/components/ProfileForm";
import { getProfile } from "@/features/cms/profile/service";
import { selectedMediaUrl } from "@/features/cms/media/paths";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ media?: string }> }) {
  const profile = await getProfile();
  const selectedMedia = selectedMediaUrl((await searchParams).media);

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage the personal information displayed on your website.
        </p>
      </div>
      {!profile ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6" key="profile-setup">
          <h2 className="text-lg font-semibold text-slate-950">Set up your portfolio profile</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Your profile has not been set up yet. Save the form below to create it once; you can edit it here afterward.</p>
        </div>
      ) : null}
      <div className="max-w-4xl" key="profile-workspace">
        <section aria-label="Profile details" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6" key="profile-editor">
          <ProfileForm initialMediaUrl={selectedMedia} profile={profile} />
        </section>
      </div>
    </main>
  );
}
