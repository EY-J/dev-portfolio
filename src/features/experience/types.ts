export interface Experience {
  id: string;
  role: string;
  company: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  technologies: string[];
  companyUrl: string | null;
  sortOrder: number;
}

export type ExperienceInput = Omit<Experience, "id" | "sortOrder">;

export interface ExperienceActionState {
  success: boolean;
  message: string | null;
  fieldErrors?: Record<string, string>;
}

export const initialExperienceState: ExperienceActionState = { success: false, message: null };
