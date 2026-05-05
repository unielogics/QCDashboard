"use client";

import { type SVGProps } from "react";

// Curated subset of design icon names used by the desktop screens.
// Each icon is a 24x24 stroke path. Add more as screens need them.
const PATHS: Record<string, string> = {
  home: "M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  pipeline: "M4 6h16M4 12h12M4 18h8",
  ai: "M12 4v3M12 17v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M3 12h3M18 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12",
  clients: "M16 14a4 4 0 1 0-8 0M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1",
  messages: "M21 12c0 4-4 7-9 7-1.4 0-2.7-.2-3.9-.6L3 20l1.6-4.2C3.6 14.4 3 13.3 3 12c0-4 4-7 9-7s9 3 9 7z",
  cal: "M3 7h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 3v4M16 3v4",
  vault: "M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM12 11v4M12 9v.01",
  rates: "M3 17l6-6 4 4 8-8M14 7h7v7",
  reports: "M3 21V8M9 21V4M15 21v-9M21 21v-5",
  rewards: "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  gear: "M19.4 13a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V18a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H5a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2H10a1 1 0 0 0 .6-.9V5a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1V10a1 1 0 0 0 .9.6H19a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9zM10 21h4",
  sparkles: "M5 3v4M3 5h4M19 13v4M17 15h4M11 7l1 3 3 1-3 1-1 3-1-3-3-1 3-1z",
  plus: "M12 5v14M5 12h14",
  trend: "M3 17l6-6 4 4 8-8",
  trendDn: "M3 7l6 6 4-4 8 8",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  chevR: "M9 6l6 6-6 6",
  chevL: "M15 6l-6 6 6 6",
  chevD: "M6 9l6 6 6-6",
  chevU: "M6 15l6-6 6 6",
  flame: "M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-2-1-3-1-5 2 1 4 3 4 6a6 6 0 1 1-12 0c0-5 6-6 6-10z",
  shield: "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z",
  build: "M3 21V9l9-6 9 6v12M9 21V12h6v9",
  doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  upload: "M12 4v12M6 10l6-6 6 6M4 20h16",
  download: "M12 4v12M18 14l-6 6-6-6M4 20h16",
  bolt: "M13 2L3 14h7l-1 8 10-12h-7z",
  user: "M16 14a4 4 0 1 0-8 0M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1",
  star: "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  pause: "M9 6v12M15 6v12",
  play: "M6 4l14 8-14 8z",
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "stroke"> {
  name: keyof typeof PATHS | string;
  size?: number;
  stroke?: number;
}

export function Icon({ name, size = 16, stroke = 1.6, style, ...rest }: IconProps) {
  const path = PATHS[name as keyof typeof PATHS];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      {...rest}
    >
      <path d={path} />
    </svg>
  );
}
