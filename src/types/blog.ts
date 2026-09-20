export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}
