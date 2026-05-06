// The Qualified Commercial brand mark — a Q (white circle + tail) and a
// C (teal arc) on a dark navy rounded square. Single source of truth across
// the desktop app; the favicon (`app/icon.svg`) and Apple touch icon
// (`app/apple-icon.svg`) are byte-identical copies of the same artwork so
// browser bookmarks and the in-app sidebar render the same shape.
//
// Mobile mirrors this via qcmobile/assets/icon.svg; the PNGs Expo needs
// (icon.png / adaptive-icon.png / splash.png) are generated from that SVG
// by the qcmobile/scripts/build-icons.mjs script.

interface Props {
  size?: number;
  /** Hide the rounded background — useful when placing on top of a tinted
   *  surface that already supplies the chrome. */
  bare?: boolean;
}

export function QCMark({ size = 32, bare = false }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="Qualified Commercial"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="qcmark-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B1D3A" />
          <stop offset="100%" stopColor="#050E1F" />
        </linearGradient>
        <linearGradient id="qcmark-teal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#21d3c7" />
          <stop offset="100%" stopColor="#18A89F" />
        </linearGradient>
      </defs>
      {!bare && <rect width="512" height="512" rx="115" fill="url(#qcmark-bg)" />}
      <circle cx="200" cy="240" r="120" fill="none" stroke="#FFFFFF" strokeWidth="52" />
      <line x1="280" y1="320" x2="350" y2="400" stroke="#FFFFFF" strokeWidth="52" strokeLinecap="square" />
      <path
        d="M 460 140 A 130 130 0 1 0 460 370"
        fill="none"
        stroke="url(#qcmark-teal)"
        strokeWidth="52"
        strokeLinecap="square"
      />
    </svg>
  );
}
