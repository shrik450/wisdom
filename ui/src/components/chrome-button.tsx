import type { ButtonHTMLAttributes, ReactNode } from "react";

export const CHROME_BUTTON_CLASSES =
  "inline-flex h-8 shrink-0 items-center rounded-md border border-bdr bg-surface px-3 text-sm leading-none text-txt transition-colors hover:border-bdr hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

interface ChromeButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
}

export function ChromeButton({
  children,
  className = "",
  type = "button",
  ...props
}: ChromeButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`${CHROME_BUTTON_CLASSES} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
