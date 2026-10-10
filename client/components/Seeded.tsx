import { ApiSeed } from "@/lib/useApi";
import { fetchSeed } from "@/lib/server-api";

// Server component: fetches the given API paths and makes them available to useApi.
export async function Seeded({ paths, children }: { paths: string[]; children: React.ReactNode }) {
  const data = await fetchSeed(paths);
  return <ApiSeed data={data}>{children}</ApiSeed>;
}
