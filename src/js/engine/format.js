/* =========================================================================
   EMBERVEIL ENGINE — FORMATTERS

   DOM-free twins of the shell's formatters, so the engine, the CLI selftest
   and the balance report all render a number identically. The faucet ladder
   spans seven orders of magnitude (§5), so suffixed output is not a nicety —
   it is a day-one requirement.
   ========================================================================= */

const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** 12450000 -> "12.45M". Three to four significant digits, no trailing zeros. */
export function compact(n) {
  if (!Number.isFinite(n)) return "0";
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) {
    const s = n % 1 === 0 ? String(n) : n.toFixed(n < 10 ? 2 : 1);
    return neg ? `-${s}` : s;
  }
  const tier = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1);
  const scaled = n / 1000 ** tier;
  const s = scaled.toFixed(scaled >= 100 ? 1 : 2).replace(/\.?0+$/, "") + UNITS[tier];
  return neg ? `-${s}` : s;
}

/** 1250 -> "1,250" */
export function int(n) {
  return Math.trunc(n).toLocaleString("en-US");
}

/** 16338 -> "04:32:18" */
export function clock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 0.654 -> "65.4%" */
export function pct(fraction, digits = 1) {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Signed percent for modifier audits: -0.12 -> "-12%". */
export function signed(fraction, digits = 0) {
  const p = fraction * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(digits)}%`;
}

/** 1090 -> "1,090 h"; 0.4 -> "24 min"; 8760 -> "1.0 yr". */
export function hours(h) {
  if (!Number.isFinite(h)) return "never";
  if (h < 1 / 60) return `${(h * 3600).toFixed(0)} s`;
  if (h < 1) return `${(h * 60).toFixed(0)} min`;
  if (h < 1000) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${int(Math.round(h))} h`;
}

/** 3.25 -> "3.25 s"; sub-second keeps two decimals. */
export function secs(s) {
  return `${s.toFixed(2).replace(/\.?0+$/, "")}s`;
}
