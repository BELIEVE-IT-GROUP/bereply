/** Lecturas sobre los Reels de una cuenta. Sin base de datos, para poder probarlas. */

export type ReelStats = {
  instagramMediaId: string;
  caption: string | null;
  publishedAt: Date;
  views: number | null;
  avgWatchMs: number | null;
  skipRate: number | null;
};

export function median(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function summarize(reels: ReelStats[]) {
  return {
    count: reels.length,
    medianViews: median(reels.map((r) => r.views)),
    medianWatchMs: median(reels.map((r) => r.avgWatchMs)),
    medianSkip: median(reels.map((r) => r.skipRate)),
  };
}

/** Un ganador supera el doble de la mediana de vistas de su propia cuenta. */
export function winners<T extends ReelStats>(reels: T[]): Array<T & { multiple: number }> {
  const base = median(reels.map((r) => r.views));
  if (!base) return [];
  return reels
    .filter((r) => (r.views ?? 0) >= base * 2)
    .map((r) => ({ ...r, multiple: Math.round(((r.views ?? 0) / base) * 10) / 10 }))
    .sort((a, b) => b.multiple - a.multiple);
}

/**
 * Compara la tasa de salto de ganadores y resto. Devuelve algo solo si los dos
 * grupos no se cruzan: si se cruzan, la frase no sería cierta y mejor no decirla.
 */
export function skipSeparation(reels: ReelStats[]) {
  const top = winners(reels);
  const ids = new Set(top.map((r) => r.instagramMediaId));
  const topSkip = top.map((r) => r.skipRate).filter((v): v is number => typeof v === "number");
  const rest = reels.filter((r) => !ids.has(r.instagramMediaId));
  const restSkip = rest.map((r) => r.skipRate).filter((v): v is number => typeof v === "number");
  if (topSkip.length < 2 || restSkip.length < 2) return null;
  const topMax = Math.max(...topSkip);
  const restMin = Math.min(...restSkip);
  if (topMax >= restMin) return null;
  return {
    topCount: topSkip.length,
    topMaxSkip: topMax,
    restCount: restSkip.length,
    restMinSkip: restMin,
    restMaxViews: Math.max(...rest.map((r) => r.views ?? 0)),
  };
}

/** El Reel que más gente pierde al inicio: un candidato claro a rehacer el gancho. */
export function worstHook<T extends ReelStats>(reels: T[]): T | null {
  const conDato = reels.filter((r) => typeof r.skipRate === "number");
  if (conDato.length === 0) return null;
  return conDato.reduce((peor, r) => ((r.skipRate as number) > (peor.skipRate as number) ? r : peor));
}
