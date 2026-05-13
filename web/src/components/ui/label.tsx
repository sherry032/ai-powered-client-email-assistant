import * as React from "react";
import { cn } from "../../lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("font-mono text-sm font-semibold uppercase leading-none text-ink", className)} {...props} />
  )
);
Label.displayName = "Label";

export { Label };
