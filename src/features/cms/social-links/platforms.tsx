import { Globe } from "lucide-react";
import {
  SiBehance, SiBluesky, SiCodepen, SiDevdotto, SiDiscord, SiDribbble,
  SiFacebook, SiGithub, SiGitlab, SiInstagram, SiLinkedin, SiMedium,
  SiPinterest, SiReddit, SiStackoverflow, SiThreads, SiTiktok, SiTwitch,
  SiX, SiYoutube,
} from "react-icons/si";

export const SOCIAL_PLATFORMS = {
  github: { label: "GitHub", icon: SiGithub, placeholder: "https://github.com/username" },
  linkedin: { label: "LinkedIn", icon: SiLinkedin, placeholder: "https://www.linkedin.com/in/username" },
  facebook: { label: "Facebook", icon: SiFacebook, placeholder: "https://www.facebook.com/username" },
  instagram: { label: "Instagram", icon: SiInstagram, placeholder: "https://www.instagram.com/username" },
  x: { label: "X / Twitter", icon: SiX, placeholder: "https://x.com/username" },
  youtube: { label: "YouTube", icon: SiYoutube, placeholder: "https://www.youtube.com/@username" },
  tiktok: { label: "TikTok", icon: SiTiktok, placeholder: "https://www.tiktok.com/@username" },
  threads: { label: "Threads", icon: SiThreads, placeholder: "https://www.threads.net/@username" },
  bluesky: { label: "Bluesky", icon: SiBluesky, placeholder: "https://bsky.app/profile/username" },
  discord: { label: "Discord", icon: SiDiscord, placeholder: "https://discord.gg/invite" },
  gitlab: { label: "GitLab", icon: SiGitlab, placeholder: "https://gitlab.com/username" },
  stackoverflow: { label: "Stack Overflow", icon: SiStackoverflow, placeholder: "https://stackoverflow.com/users/123456/username" },
  behance: { label: "Behance", icon: SiBehance, placeholder: "https://www.behance.net/username" },
  dribbble: { label: "Dribbble", icon: SiDribbble, placeholder: "https://dribbble.com/username" },
  medium: { label: "Medium", icon: SiMedium, placeholder: "https://medium.com/@username" },
  dev: { label: "DEV", icon: SiDevdotto, placeholder: "https://dev.to/username" },
  codepen: { label: "CodePen", icon: SiCodepen, placeholder: "https://codepen.io/username" },
  twitch: { label: "Twitch", icon: SiTwitch, placeholder: "https://www.twitch.tv/username" },
  reddit: { label: "Reddit", icon: SiReddit, placeholder: "https://www.reddit.com/user/username" },
  pinterest: { label: "Pinterest", icon: SiPinterest, placeholder: "https://www.pinterest.com/username" },
  other: { label: "Website / Other", icon: Globe, placeholder: "https://example.com" },
} as const;

export type SocialPlatformKey = keyof typeof SOCIAL_PLATFORMS;

export const SOCIAL_PLATFORM_OPTIONS = Object.entries(SOCIAL_PLATFORMS).map(([key, definition]) => ({
  key: key as SocialPlatformKey,
  label: definition.label,
}));

const PLATFORM_ALIASES: Record<string, SocialPlatformKey> = {
  twitter: "x",
  "x / twitter": "x",
  "stack overflow": "stackoverflow",
  "dev.to": "dev",
  "website / other": "other",
  website: "other",
};

export function getSocialPlatformKey(value: string): SocialPlatformKey | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (Object.hasOwn(SOCIAL_PLATFORMS, normalized)) return normalized as SocialPlatformKey;
  return PLATFORM_ALIASES[normalized] ??
    (SOCIAL_PLATFORM_OPTIONS.find((option) => option.label.toLowerCase() === normalized)?.key ?? null);
}

export function getSocialPlatformLabel(value: string): string {
  const key = getSocialPlatformKey(value);
  return key ? SOCIAL_PLATFORMS[key].label : value.trim() || "Website / Other";
}

export function detectSocialPlatformFromUrl(value: string): SocialPlatformKey | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const domains: [string, SocialPlatformKey][] = [
      ["github.com", "github"], ["linkedin.com", "linkedin"], ["instagram.com", "instagram"],
      ["facebook.com", "facebook"], ["x.com", "x"], ["twitter.com", "x"],
      ["youtube.com", "youtube"], ["youtu.be", "youtube"], ["tiktok.com", "tiktok"],
      ["threads.net", "threads"], ["bsky.app", "bluesky"], ["discord.com", "discord"],
      ["discord.gg", "discord"], ["gitlab.com", "gitlab"], ["stackoverflow.com", "stackoverflow"],
      ["behance.net", "behance"], ["dribbble.com", "dribbble"], ["medium.com", "medium"],
      ["dev.to", "dev"], ["codepen.io", "codepen"], ["twitch.tv", "twitch"],
      ["reddit.com", "reddit"], ["pinterest.com", "pinterest"],
    ];
    return domains.find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1] ?? null;
  } catch {
    return null;
  }
}

export function SocialIcon({ platform, className, size = 18 }: { platform: string; className?: string; size?: number }) {
  const key = getSocialPlatformKey(platform);
  const Icon = key ? SOCIAL_PLATFORMS[key].icon : Globe;
  return <Icon aria-hidden="true" className={className} size={size} />;
}
