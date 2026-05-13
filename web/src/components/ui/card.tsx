import * as React from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border border-ink/10 bg-surface text-ink shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-2 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-2xl font-semibold tracking-normal text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-base leading-6 text-ink/60", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}
