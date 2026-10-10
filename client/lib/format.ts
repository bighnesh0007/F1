// Formatting helpers: local times, countdowns, flags.

export function localTime(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", ...opts });
}

export function localDay(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function dateRange(startIso: string, endIso: string) {
  const a = new Date(startIso);
  const b = new Date(endIso);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
}

export function countdownParts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export const timeZoneName = () =>
  Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";

const flag = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));

const COUNTRY_CODES: Record<string, string> = {
  australia: "AU", austria: "AT", azerbaijan: "AZ", bahrain: "BH", belgium: "BE", brazil: "BR", canada: "CA",
  china: "CN", france: "FR", germany: "DE", hungary: "HU", italy: "IT", japan: "JP", malaysia: "MY", mexico: "MX",
  monaco: "MC", netherlands: "NL", portugal: "PT", qatar: "QA", russia: "RU", "saudi arabia": "SA", singapore: "SG",
  spain: "ES", turkey: "TR", uae: "AE", "united arab emirates": "AE", uk: "GB", "united kingdom": "GB",
  "great britain": "GB", usa: "US", "united states": "US", argentina: "AR", "south africa": "ZA", korea: "KR",
  india: "IN", vietnam: "VN", sweden: "SE", switzerland: "CH", morocco: "MA", thailand: "TH",
};

const NATIONALITY_CODES: Record<string, string> = {
  american: "US", argentine: "AR", argentinian: "AR", australian: "AU", austrian: "AT", belgian: "BE", brazilian: "BR",
  british: "GB", canadian: "CA", chinese: "CN", colombian: "CO", danish: "DK", dutch: "NL", finnish: "FI",
  french: "FR", german: "DE", indian: "IN", italian: "IT", japanese: "JP", mexican: "MX", monegasque: "MC",
  "new zealander": "NZ", polish: "PL", russian: "RU", spanish: "ES", swedish: "SE", swiss: "CH", thai: "TH",
  venezuelan: "VE", "south african": "ZA", portuguese: "PT", irish: "IE", hungarian: "HU", czech: "CZ",
};

export const countryFlag = (country?: string | null) => {
  const code = COUNTRY_CODES[String(country ?? "").toLowerCase()];
  return code ? flag(code) : "🏁";
};

export const nationalityFlag = (nationality?: string | null) => {
  const code = NATIONALITY_CODES[String(nationality ?? "").toLowerCase()];
  return code ? flag(code) : "";
};

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function parseLapTime(value?: string | null) {
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2]);
}

export function formatLapTime(seconds: number | null | undefined) {
  if (seconds == null || !isFinite(seconds)) return "–";
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(3).padStart(6, "0");
  return m ? `${m}:${s}` : s;
}
