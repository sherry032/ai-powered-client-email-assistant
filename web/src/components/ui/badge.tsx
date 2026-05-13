import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-sm px-2.5 py-1 font-mono text-xs font-semibold uppercase", {
  variants: {
    variant: {
      default: "bg-primary text-white",
      success: "bg-success/10 text-success ring-1 ring-inset ring-success/25",
      destructive: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/25",
      secondary: "bg-secondary text-ink"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
