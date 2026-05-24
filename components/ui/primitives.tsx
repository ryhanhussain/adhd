"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

type PageShellProps = {
  children: ReactNode;
  maxWidth?: "md" | "lg" | "xl";
  className?: string;
};

export function PageShell({ children, maxWidth = "lg", className }: PageShellProps) {
  const widthClass = {
    md: "max-w-3xl",
    lg: "max-w-5xl",
    xl: "max-w-6xl",
  }[maxWidth];

  return (
    <div className={cn("mx-auto flex w-full flex-col gap-4 pb-8 sm:gap-5 sm:pb-12", widthClass, className)}>
      {children}
    </div>
  );
}

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-0.5 text-2xl font-black leading-tight tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

type SectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold leading-tight tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

type PanelProps = {
  children: ReactNode;
  className?: string;
  as?: "section" | "aside" | "div";
};

export function Panel({ children, className, as: Component = "section" }: PanelProps) {
  return (
    <Component
      className={cn(
        "rounded-2xl border border-[var(--glass-border)] bg-[var(--color-surface-elevated)]/80 p-4 shadow-[0_18px_60px_-34px_rgba(40,20,80,0.35)] backdrop-blur sm:p-5",
        className
      )}
    >
      {children}
    </Component>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const variantClass = {
    primary:
      "border-transparent bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_14px_30px_-18px_var(--color-accent)] hover:opacity-95",
    secondary:
      "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]/45 hover:bg-[var(--color-surface-elevated)]",
    ghost:
      "border-transparent bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
    danger:
      "border-red-500/25 bg-red-500/10 text-red-600 hover:border-red-500/40 hover:bg-red-500/15 dark:text-red-300",
  }[variant];
  const sizeClass = {
    sm: "min-h-10 px-3 text-xs",
    md: "min-h-11 px-4 text-sm",
    lg: "min-h-12 px-5 text-sm",
  }[size];

  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
        focusRing,
        variantClass,
        sizeClass,
        fullWidth && "w-full",
        className
      )}
      {...props}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  const sizeClass = size === "sm" ? "h-10 w-10" : "h-11 w-11";
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center rounded-xl border transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45",
        focusRing,
        variant === "primary" &&
          "border-transparent bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_14px_30px_-18px_var(--color-accent)]",
        variant === "secondary" &&
          "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]/45 hover:bg-[var(--color-surface-elevated)]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
        variant === "danger" &&
          "border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300",
        sizeClass,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</span>}
      {children}
      {hint && <span className="text-xs font-medium text-[var(--color-text-muted)]">{hint}</span>}
    </div>
  );
}

export function inputClassName(className?: string) {
  return cn(
    "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text)] transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50",
    focusRing,
    className
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClassName(cn("min-h-11", className))} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={inputClassName(cn("py-3 leading-6", className))} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClassName(cn("min-h-11 appearance-none pr-9", className))} {...props} />;
}

type SegmentedControlOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition-all",
              focusRing,
              active
                ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_12px_26px_-18px_var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type MetadataChipProps = {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger" | "success";
  className?: string;
};

export function MetadataChip({ children, tone = "neutral", className }: MetadataChipProps) {
  const toneClass = {
    neutral: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]",
    accent: "border-[var(--color-accent)]/25 bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
    danger: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold leading-none",
        toneClass,
        className
      )}
    >
      {children}
    </span>
  );
}

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          {icon}
        </div>
      )}
      <p className="text-sm font-bold text-[var(--color-text)]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm font-medium text-[var(--color-text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { focusRing };
