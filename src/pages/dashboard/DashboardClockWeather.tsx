import { useQuery } from '@tanstack/react-query';
import { CloudSunIcon, Clock3Icon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { getColomboWeather } from '../../services/weather';
import { businessTime, BUSINESS_TIMEZONE } from '../../utils/shiftTime';

export function DashboardClockWeather({now}:{now:Date}) {
  const weather=useQuery({queryKey:['weather','Colombo'],queryFn:({signal})=>getColomboWeather(signal),staleTime:10*60000,refetchInterval:10*60000,retry:1});
  return <Card className="flex min-w-0 flex-col justify-between p-5 sm:p-6">
    <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Colombo · Sri Lanka</h2><Clock3Icon className="h-5 w-5 text-primary" aria-hidden /></div>
    <div className="my-5"><time dateTime={now.toISOString()} className="font-mono text-4xl font-semibold tabular-nums sm:text-5xl">{businessTime(now)}</time><p className="mt-2 text-sm text-ink-muted">{new Intl.DateTimeFormat('en-GB',{timeZone:BUSINESS_TIMEZONE,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now)}</p><p className="mt-1 text-xs text-ink-subtle">System time · Asia/Colombo</p></div>
    <div className="border-t border-line pt-4">
      {weather.isPending?<p role="status" className="text-sm text-ink-muted">Loading Colombo weather…</p>:weather.isError?<p role="status" className="text-sm text-ink-muted">Weather unavailable. <button className="text-primary underline" onClick={()=>weather.refetch()}>Retry</button></p>:<><div className="flex items-center gap-3"><CloudSunIcon className="h-9 w-9 text-primary" aria-hidden/><div><p className="text-2xl font-semibold">{Math.round(weather.data.temperature)}°C <span className="text-sm font-normal">{weather.data.condition}</span></p><p className="mt-1 text-xs text-ink-muted">Humidity {weather.data.humidity}% · Wind {weather.data.wind} km/h</p></div></div><p className="mt-3 text-[11px] text-ink-subtle">Weather as of {weather.data.observedAt.slice(11,16)} Colombo time · <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">Open-Meteo</a></p></>}
    </div>
  </Card>;
}
