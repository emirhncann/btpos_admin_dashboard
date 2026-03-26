import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "success" | "danger" | "warning" | "default";
  children: React.ReactNode;
  className?: string;
}

const variants = {
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  danger:  "bg-red-50 text-red-700 ring-1 ring-red-600/20",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20",
  default: "bg-gray-100 text-gray-600 ring-1 ring-gray-500/20",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
