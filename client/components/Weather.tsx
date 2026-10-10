"use client";

import { Panel } from "./LiveDashboard";

type WeatherData = Partial<Record<"AirTemp" | "TrackTemp" | "Humidity" | "Pressure" | "Rainfall" | "WindSpeed" | "WindDirection", string>>;

export function Weather({ weather }: { weather?: WeatherData }) {
  if (!weather) return null;
  const items = [
    ["Air", weather.AirTemp && `${weather.AirTemp} °C`],
    ["Track", weather.TrackTemp && `${weather.TrackTemp} °C`],
    ["Humidity", weather.Humidity && `${weather.Humidity}%`],
    ["Wind", weather.WindSpeed && `${weather.WindSpeed} m/s ${weather.WindDirection ? `${weather.WindDirection}°` : ""}`],
    ["Pressure", weather.Pressure && `${weather.Pressure} hPa`],
    ["Rain", weather.Rainfall != null ? (Number(weather.Rainfall) > 0 ? "Yes" : "No") : undefined],
  ];
  return (
    <Panel title="Weather">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</dt>
            <dd className="font-mono tabular-nums">{value || "–"}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
