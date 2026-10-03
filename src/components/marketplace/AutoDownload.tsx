"use client";

import { useEffect, useState } from "react";

/** Starts the download of a just-bought file once, in a hidden frame, so the buyer stays on the page. The Download button remains for anyone whose browser or the file's host blocks this. */
export function AutoDownload({ orderId }: { orderId: string }) {
  const [start, setStart] = useState(false);
  useEffect(() => {
    const key = `circuit-download-${orderId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: still fine to try once per page view.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounts the frame only after hydration, once
    setStart(true);
  }, [orderId]);
  return start ? <iframe title="Download" src={`/api/marketplace/orders/${orderId}/download`} hidden aria-hidden /> : null;
}
