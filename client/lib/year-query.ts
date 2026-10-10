// ?year= from page searchParams, as the query string API calls use.
export async function yearQueryFrom(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const year = (await searchParams).year;
  return typeof year === "string" && /^\d{4}$/.test(year) ? `?year=${year}` : "";
}
