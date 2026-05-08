"use client";

// Full port of .design/qualified-commercial/project/icons.jsx
// Stroke-based icons that inherit `currentColor`. Use the design's exact
// path data so the visual identity matches pixel-for-pixel.

import { type SVGProps } from "react";

const ICON_PATHS: Record<string, string> = {
  // Layout
  home:      "M3 11l9-8 9 8M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5",
  cal:       "M3 7a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 10h18M8 3v4M16 3v4",
  calc:      "M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1zM7 7h10M7 11h2M11 11h2M15 11h2M7 15h2M11 15h2M15 15h2",
  chat:      "M4 5a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-4l-5 4v-4H6a2 2 0 01-2-2V5z",
  vault:     "M4 6a2 2 0 012-2h8l6 6v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 4v5a1 1 0 001 1h5",

  // People
  user:      "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",

  // Actions
  plus:      "M12 5v14M5 12h14",
  spark:     "M12 2l2.4 6.5L21 10l-5.4 4 1.7 7L12 17l-5.4 4 1.7-7L3 10l6.6-1.5L12 2z",
  bolt:      "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
  shield:    "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z",
  shieldChk: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3zM8 11l3 3 5-5",

  // Trend / nav
  trend:     "M3 17l6-6 4 4 8-8M21 7v6h-6",
  trendDn:   "M3 7l6 6 4-4 8 8M21 17v-6h-6",
  arrowR:    "M5 12h14M13 5l7 7-7 7",
  arrowL:    "M19 12H5M11 5l-7 7 7 7",
  chevR:     "M9 6l6 6-6 6",
  chevL:     "M15 6l-6 6 6 6",
  chevD:     "M6 9l6 6 6-6",
  chevU:     "M18 15l-6-6-6 6",

  // States
  check:     "M5 13l4 4L19 7",
  x:         "M6 6l12 12M18 6L6 18",
  close:     "M6 6l12 12M18 6L6 18",
  lock:      "M6 11h12v9a1 1 0 01-1 1H7a1 1 0 01-1-1v-9zM8 11V7a4 4 0 018 0v4",
  unlock:    "M6 11h12v9a1 1 0 01-1 1H7a1 1 0 01-1-1v-9zM8 11V7a4 4 0 017.5-2",

  // Files
  doc:       "M6 3h9l5 5v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5",
  docCheck:  "M6 3h9l5 5v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M9 14l2 2 5-5",
  file:      "M6 3h9l5 5v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5",
  download:  "M12 3v12M7 10l5 5 5-5M5 21h14",

  // Money / metrics
  dollar:    "M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  audit:     "M12 8v4l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",

  // System / chrome
  bell:      "M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9zM10 21a2 2 0 004 0",
  filter:    "M4 5h16M7 12h10M10 19h4",
  search:    "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  pin:       "M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13zM12 11a2 2 0 100-4 2 2 0 000 4z",
  scan:      "M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M4 12h16",
  star:      "M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  more:      "M5 12h.01M12 12h.01M19 12h.01",
  send:      "M3 12l18-9-7 18-3-7-8-2z",
  mic:       "M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3zM5 11a7 7 0 0014 0M12 18v3",
  sliders:   "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M18 18h2M14 4v4M6 10v4M16 16v4",
  refresh:   "M4 12a8 8 0 0114-5l2-2M20 12a8 8 0 01-14 5l-2 2M20 4v5h-5M4 20v-5h5",

  // Theme
  sun:       "M12 4V2M12 22v-2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon:      "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",

  // Real estate / loan
  bldg:      "M4 21V5a1 1 0 011-1h6a1 1 0 011 1v16M12 21V9a1 1 0 011-1h6a1 1 0 011 1v12M3 21h18M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2",
  building:  "M4 21V5a1 1 0 011-1h6a1 1 0 011 1v16M12 21V9a1 1 0 011-1h6a1 1 0 011 1v12M3 21h18M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2",
  building2: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01",
  flame:     "M12 2s5 5 5 10a5 5 0 11-10 0c0-2 1-3 1-3s1 2 3 2c0-3-2-5-2-9 0 0 3 0 3 0z",
  hammer:    "M14 7l-1-1a2 2 0 010-3l3 3a2 2 0 01-3 0l-1-1zM13 8l-9 9 3 3 9-9",
  key:       "M14 7a4 4 0 110 8 4 4 0 010-8zM10 11l-7 7v3h3v-2h2v-2h2l3-3",
  map:       "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15",
  flag:      "M5 21V4M5 4h12l-2 4 2 4H5",

  // Layers / org
  layers:    "M12 2l10 6-10 6L2 8l10-6zM2 14l10 6 10-6M2 18l10 6 10-6",
  link:      "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
  external:  "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3",

  // Rewards
  trophy:    "M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM7 4H4v3a3 3 0 003 3M17 4h3v3a3 3 0 01-3 3",
  gift:      "M3 12v9a1 1 0 001 1h16a1 1 0 001-1v-9M2 7h20v5H2V7zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z",

  // Feedback
  thumbsUp:   "M7 22V11M14 5.4l-1 4.6h6.2a2 2 0 011.96 2.4l-1.4 7A2 2 0 0117.8 21H7M3 11h4v11H3V11z",
  thumbsDown: "M7 2v11M14 18.6l-1-4.6h6.2a2 2 0 002-2.4l-1.4-7A2 2 0 0017.8 3H7M3 13h4V2H3v11z",
  comment:    "M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z",
  pencil:     "M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z",

  // Misc
  alert:     "M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  device:    "M9 3h6a2 2 0 012 2v14a2 2 0 01-2 2H9a2 2 0 01-2-2V5a2 2 0 012-2zM12 18h.01",
  play:      "M6 4l14 8-14 8V4z",
  pause:     "M7 4h4v16H7V4zM13 4h4v16h-4V4z",
  gear:      "M12 8a4 4 0 100 8 4 4 0 000-8zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",

  // Shorter aliases (back-compat for code that already used these names)
  sparkles:  "M12 2l2.4 6.5L21 10l-5.4 4 1.7 7L12 17l-5.4 4 1.7-7L3 10l6.6-1.5L12 2z",
  ai:        "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
  build:     "M3 21V9l9-6 9 6v12M9 21V12h6v9",
  pipeline:  "M12 2l10 6-10 6L2 8l10-6zM2 14l10 6 10-6M2 18l10 6 10-6",
  clients:   "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  messages:  "M4 5a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-4l-5 4v-4H6a2 2 0 01-2-2V5z",
  rates:     "M3 17l6-6 4 4 8-8M21 7v6h-6",
  reports:   "M3 17l6-6 4 4 8-8M21 7v6h-6",
  rewards:   "M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  upload:    "M12 21V9M7 14l5-5 5 5M5 3h14",
  paperclip: "M21 11l-9.5 9.5a5.5 5.5 0 01-7.78-7.78L13.4 3a4 4 0 015.66 5.66L9.5 18.22a2.5 2.5 0 01-3.54-3.54L14.62 5.99",
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "stroke"> {
  name: keyof typeof ICON_PATHS | string;
  size?: number;
  stroke?: number;
}

export function Icon({ name, size = 16, stroke = 2, style, ...rest }: IconProps) {
  const path = ICON_PATHS[name as keyof typeof ICON_PATHS];
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
      style={{ flexShrink: 0, ...style }}
      {...rest}
    >
      <path d={path} />
    </svg>
  );
}

// "Q" mark for the brand monogram (not currently used; kept for parity)
export function QCMark({ size = 22, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M14 14l4 4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" fill={color} />
    </svg>
  );
}
