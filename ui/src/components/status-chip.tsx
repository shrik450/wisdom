import type { ReactNode } from "react";

interface StatusChipProps {
  children: ReactNode;
  prefix?: ReactNode;
  className?: string;
}

const STATUS_CHIP_CLASSES =
  "inline-flex items-center gap-2 rounded-md border border-bdr bg-surface-raised px-2 py-1 text-xs uppercase tracking-[0.12em] text-txt-muted";

export function StatusChip({
  children,
  prefix,
  className = "",
}: StatusChipProps) {
  return (
    <span className={`${STATUS_CHIP_CLASSES} ${className}`.trim()}>
      {prefix ? <span>{prefix}</span> : null}
      <span>{children}</span>
    </span>
  );
}
