import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/ui/cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-solid border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring",
        xs: "h-6 gap-1 rounded px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring",
        lg: "h-10 gap-2 rounded-md px-6 text-sm focus-visible:ring-2 focus-visible:ring-ring",
        icon: "size-9 rounded-md focus-visible:ring-2 focus-visible:ring-ring",
        "icon-xs": "size-6 rounded focus-visible:ring-2 focus-visible:ring-ring",
        "icon-sm": "size-8 rounded-md focus-visible:ring-2 focus-visible:ring-ring",
        "icon-lg": "size-10 rounded-md focus-visible:ring-2 focus-visible:ring-ring",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
