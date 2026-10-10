import ExperienceManager from "@/features/experience/components/ExperienceManager";
import { getExperiences } from "@/features/experience/service";

export default async function ExperiencePage() {
  const experiences = await getExperiences();
  return <main className="mx-auto max-w-5xl space-y-6"><ExperienceManager experiences={experiences} /></main>;
}
