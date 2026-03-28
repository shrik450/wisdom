import type { HTMLAttributes, ReactNode } from "react";

export const CONTENT_FRAME_CLASSES = "rounded-md border border-bdr bg-surface";

interface ContentFrameProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ContentFrame({
  children,
  className = "",
  ...props
}: ContentFrameProps) {
  return (
    <div {...props} className={`${CONTENT_FRAME_CLASSES} ${className}`.trim()}>
      {children}
    </div>
  );
}
