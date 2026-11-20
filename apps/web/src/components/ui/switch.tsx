"use client";

/** Accessible on/off switch (role=switch). Name it with `labelledBy` so the name starts with the visible text. */
export function Switch({
  checked,
  onChange,
  labelledBy,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelledBy?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="sw2"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-disabled={disabled ? true : undefined}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    />
  );
}
