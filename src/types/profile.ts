export interface Profile {
  id: string;
  name: string;
  title: string;
  bio: string;
  avatarUrl?: string;
  resumeUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
