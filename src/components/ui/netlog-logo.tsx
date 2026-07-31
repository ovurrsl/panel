/**
 * Netlog brand lockup: the yellow swoosh plus a theme-aware wordmark.
 *
 * Placeholder geometry — the design bundle ships this as `NetlogLogo.dc.html`
 * and the handoff README says outright that it "must be replaced with the brand
 * asset already in the codebase". The contract it has to honour is the colour
 * split: the mark stays #FFC629 in both themes, the wordmark follows
 * --dt-wordmark (#F0F0F0 dark / #002D74 light).
 */
export function NetlogLogo({ className, title = 'Netlog' }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 200 70"
      role="img"
      aria-label={title}
      className={className}
      style={{ display: 'block' }}
    >
      <path
        d="M4 34c14-18 34-27 56-27 15 0 27 5 34 14-9-5-19-7-30-7-20 0-38 8-50 24Z"
        fill="#FFC629"
      />
      <path d="M12 48c16-14 36-21 58-21 12 0 22 2 30 6-9-2-18-3-27-3-23 0-43 7-61 21Z" fill="#FFC629" />
      <text
        x="0"
        y="68"
        fill="var(--dt-wordmark, #F0F0F0)"
        fontFamily="var(--font-barlow), system-ui, sans-serif"
        fontSize="15"
        fontWeight="700"
        letterSpacing="0.06em"
      >
        NETLOG
      </text>
      <text
        x="66"
        y="68"
        fill="var(--dt-muted-fg)"
        fontFamily="var(--font-barlow), system-ui, sans-serif"
        fontSize="10.5"
        fontWeight="500"
        letterSpacing="0.1em"
      >
        LOJİSTİK GRUBU
      </text>
    </svg>
  );
}

/** Logo + hairline divider + product name — the lockup used in every header. */
export function BrandLockup({
  label,
  meta,
  logoClassName = 'w-[86px] h-[30px]',
  labelClassName = 'text-sm font-semibold tracking-[-0.01em]',
}: {
  label: string;
  meta?: string;
  logoClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-[10px] overflow-hidden">
      <NetlogLogo className={`${logoClassName} shrink-0`} />
      <span className="h-5 w-px shrink-0 bg-border" />
      <span className={`${labelClassName} whitespace-nowrap text-fg`}>{label}</span>
      {meta ? (
        <span className="whitespace-nowrap font-mono text-[9px] tracking-[0.14em] text-muted-fg">{meta}</span>
      ) : null}
    </div>
  );
}
