"use client";

import { CloudRain, MapPin, Sun, Sunrise, Sunset, Ticket } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import type { Trip } from "@/lib/types";
import { Card, Skeleton } from "@/components/ui";

// "Going to the race": track time vs. your time, daylight, weather, and links for
// tickets and directions.
export function TripCard({ lat, lon, date, name }: { lat: number; lon: number; date: string; name: string }) {
  const { data, error } = useApi<Trip>(`/api/trip?lat=${lat}&lon=${lon}&date=${encodeURIComponent(date)}`);
  const now = useNow(60_000);
  if (error && !data) return null;

  const trackTime = (iso: string | null) => (iso ? iso.slice(11, 16) : "–");
  const yourOffset = now != null ? -new Date(now).getTimezoneOffset() * 60 : null;
  const diffHours = data?.utcOffsetSeconds != null && yourOffset != null ? (data.utcOffsetSeconds - yourOffset) / 3600 : null;
  const clock =
    data?.timezone && now != null
      ? new Date(now).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: data.timezone })
      : null;

  return (
    <Card title="Going to the race" icon={<MapPin size={15} />}>
      {!data ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">Time at the track</p>
              <p className="font-display text-lg font-bold">{clock ?? "–"}</p>
              <p className="text-xs text-muted">
                {diffHours == null ? data.timezone : diffHours === 0 ? "Same as yours" : `${diffHours > 0 ? "+" : ""}${diffHours}h vs. you`}
              </p>
            </div>
            <div className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">Daylight on race day</p>
              <p className="flex items-center gap-2 font-display text-lg font-bold">
                <Sunrise size={15} className="text-faint" /> {trackTime(data.sunrise)} <Sunset size={15} className="text-faint" /> {trackTime(data.sunset)}
              </p>
              <p className="text-xs text-muted">Local track time</p>
            </div>
          </div>
          {data.forecast ? (
            <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              {(data.forecast.rainChance ?? 0) >= 40 ? <CloudRain size={16} className="text-blue-500" /> : <Sun size={16} className="text-yellow" />}
              Race-day forecast: {Math.round(data.forecast.minTemp)}–{Math.round(data.forecast.maxTemp)}°C
              {data.forecast.rainChance != null && `, ${data.forecast.rainChance}% chance of rain`}
            </p>
          ) : data.climate ? (
            <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <Sun size={16} className="text-yellow" />
              Typically {Math.round(data.climate.minTemp)}–{Math.round(data.climate.maxTemp)}°C on this date; rain on {data.climate.rainyYears} of the last {data.climate.years} years.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <a href="https://tickets.formula1.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-2">
              <Ticket size={14} /> Official tickets
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"
              aria-label={`Directions to ${name}`}
            >
              <MapPin size={14} /> Directions
            </a>
          </div>
          <p className="text-[11px] text-faint">Weather by Open-Meteo.</p>
        </div>
      )}
    </Card>
  );
}
