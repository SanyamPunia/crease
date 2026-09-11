/** The separator between items in a metadata row. Never a middot character. */
export function MetaDot() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-1 shrink-0 rounded-full bg-rule-strong"
    />
  );
}
