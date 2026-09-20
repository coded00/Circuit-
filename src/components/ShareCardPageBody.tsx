"use client";

/**
 * Circuit — shared layout for the three win-share pages (Champion,
 * wager-Battle win, Top Fragger). Each page's own `generateMetadata`
 * points social unfurls straight at the `/api/share/**` image route;
 * this body just shows that same image inline plus the two ways to
 * actually get it out into the world.
 */

import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { ShareButton } from "@/components/ShareButton";

export function ShareCardPageBody({
  imageUrl,
  pageUrl,
  shareTitle,
  heading,
  subheading,
  backHref,
}: {
  imageUrl: string;
  pageUrl: string;
  shareTitle: string;
  heading: string;
  subheading: string;
  backHref: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
        <ArrowLeft size={15} />
        Back
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h1>
        <p className="text-sm text-muted">{subheading}</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated PNG endpoint, not a static asset next/image can optimize */}
      <img src={imageUrl} alt={shareTitle} className="w-full rounded-[16px] border border-border" />
      <div className="flex flex-wrap items-center gap-3">
        <ShareButton title={shareTitle} url={pageUrl} />
        <a href={imageUrl} download className="btn-secondary">
          <Download size={14} />
          Download image
        </a>
      </div>
    </div>
  );
}
