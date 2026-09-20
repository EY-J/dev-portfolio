import ProfileForm from "@/features/cms/profile/components/ProfileForm";
import ProfilePreview from "@/features/cms/profile/components/ProfilePreview";
import { getProfile } from "@/features/cms/profile/service";

export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage the personal information displayed on your website.
        </p>
      </div>
      {profile ? (
        <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-5 text-lg font-semibold">Preview</h2>
            <ProfilePreview profile={profile} />
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-5 text-lg font-semibold">Profile details</h2>
            <ProfileForm profile={profile} />
          </section>
        </div>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">
          No profile record was found.
        </p>
      )}
    </main>
  );
}
