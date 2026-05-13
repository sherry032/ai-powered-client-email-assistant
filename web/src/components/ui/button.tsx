import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 items-center gap-2 rounded-md px-4 font-mono text-sm font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-[#e84f00]",
        secondary: "border border-ink/10 bg-secondary text-ink hover:bg-white",
        outline: "border border-ink/15 bg-white text-ink hover:border-primary hover:text-primary",
        ghost: "bg-transparent text-ink/70 hover:bg-secondary hover:text-ink"
      },
      justify: {
        center: "justify-center",
        start: "justify-start"
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3",
        lg: "h-12 px-5"
      }
    },
    defaultVariants: {
      variant: "default",
      justify: "center",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, justify, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, justify, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
