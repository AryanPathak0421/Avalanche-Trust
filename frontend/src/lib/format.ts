import { formatEther, parseEther } from "viem";
import { format, formatDistanceToNowStrict } from "date-fns";

export function shortAddress(address: string | undefined, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function shortHash(hash: string | undefined, chars = 6): string {
  if (!hash) return "";
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

export function formatAvax(wei: bigint | undefined, maxDecimals = 4): string {
  if (wei === undefined) return "—";
  const value = Number(formatEther(wei));
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
  return `${formatted} AVAX`;
}

export function parseAvax(value: string): bigint {
  return parseEther(value.trim());
}

export function formatDate(unixSeconds: number | bigint | undefined): string {
  const secs = Number(unixSeconds ?? 0);
  if (!secs) return "—";
  return format(new Date(secs * 1000), "d MMM yyyy, HH:mm");
}

export function formatDateLong(unixSeconds: number | bigint | undefined): string {
  const secs = Number(unixSeconds ?? 0);
  if (!secs) return "—";
  return format(new Date(secs * 1000), "d MMMM yyyy");
}

export function formatRelative(unixSeconds: number | bigint | undefined): string {
  const secs = Number(unixSeconds ?? 0);
  if (!secs) return "—";
  const date = new Date(secs * 1000);
  const distance = formatDistanceToNowStrict(date);
  return date.getTime() < Date.now() ? `${distance} ago` : `in ${distance}`;
}

export function isPast(unixSeconds: number | bigint): boolean {
  return Number(unixSeconds) * 1000 <= Date.now();
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
