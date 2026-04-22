import { Slot } from "@radix-ui/react-slot";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Button = forwardRef(function Button(
  { asChild = false, variant = "primary", size = "md", className, ...props },
  ref
) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      ref={ref}
      className={cn("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      {...props}
    />
  );
});
