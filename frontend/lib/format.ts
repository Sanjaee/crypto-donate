export function formatIDR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const neg = n < 0;
  const abs = Math.abs(n);
  const s = abs.toLocaleString("id-ID").replace(/,/g, ".");
  return (neg ? "-" : "") + "Rp" + s;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
