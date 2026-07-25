"use client";

type AppIconName =
  | "settings"
  | "add"
  | "gallery"
  | "crate"
  | "favorite"
  | "search"
  | "close";

type AppIconProps = {
  name: AppIconName;
  size?: number;
};

export function AppIcon({ name, size = 22 }: AppIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "settings") {
    return (
      <svg {...common}>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4" />
      </svg>
    );
  }

  if (name === "add") {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "gallery") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
    );
  }

  if (name === "crate") {
    return (
      <svg {...common}>
        <path d="M5 5h14l-1 3H6L5 5Z" />
        <path d="M6.5 10h11l-.9 3h-9.2l-.9-3ZM7.5 15h9l-.8 3h-7.4l-.8-3Z" />
      </svg>
    );
  }

  if (name === "favorite") {
    return (
      <svg {...common}>
        <path d="M20.8 5.8c-2-2-5.2-1.8-7 .4L12 8.3l-1.8-2.1c-1.8-2.2-5-2.4-7-.4-2.2 2.2-2 5.8.2 7.8L12 21l8.6-7.4c2.2-2 2.4-5.6.2-7.8Z" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.5 4.5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
