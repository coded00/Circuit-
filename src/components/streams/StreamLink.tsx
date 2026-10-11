import { Tv } from "lucide-react";
import type { StreamPlatform } from "@prisma/client";
import { channelName, platformDisplayName } from "@/lib/streams";

/**
 * A link to someone's stream: the platform and, when it can be read from the address, the channel. It opens in a new
 * tab with no link back to Circuit, and is marked as user-supplied so it doesn't pass on search ranking.
 */
export function StreamLink({ platform, platformName, url, compact = false }: { platform: StreamPlatform | null; platformName: string | null; url: string; compact?: boolean }) {
  const where = platformDisplayName(platform, platformName);
  const channel = channelName(platform, url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      title={channel ? `Watch ${channel} on ${where}` : `Watch on ${where}`}
      className="inline-flex items-center gap-1 text-xs text-accent-blue hover:underline"
    >
      <Tv size={12} aria-hidden />
      {compact ? where : channel ? `${where} · ${channel}` : `Watch on ${where}`}
    </a>
  );
}
