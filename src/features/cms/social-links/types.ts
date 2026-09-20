export interface SocialLinkInput {
  platform: string;
  url: string;
  icon: string;
}

export interface SocialLinkRow {
  id: string;
  platform: string;
  url: string;
  icon: string;
  created_at: string;
}

export interface SocialLinkActionState {
  success: boolean;
  message: string | null;
}
