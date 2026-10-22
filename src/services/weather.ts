export interface ColomboWeather { temperature:number; condition:string; humidity:number; wind:number; observedAt:string }
export function weatherCondition(code:number):string {
  if(code===0)return 'Clear sky';
  if([1,2].includes(code))return 'Partly cloudy';
  if(code===3)return 'Overcast';
  if([45,48].includes(code))return 'Fog';
  if(code>=51&&code<=57)return 'Drizzle';
  if(code>=61&&code<=67)return 'Rain';
  if(code>=71&&code<=77)return 'Snow';
  if(code>=80&&code<=82)return 'Rain showers';
  if([85,86].includes(code))return 'Snow showers';
  if(code>=95&&code<=99)return 'Thunderstorms';
  return 'Conditions unavailable';
}
export async function getColomboWeather(signal?:AbortSignal):Promise<ColomboWeather> {
  const response=await fetch('https://api.open-meteo.com/v1/forecast?latitude=6.9271&longitude=79.8612&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FColombo',{signal});
  if(!response.ok)throw new Error('Weather service unavailable');
  const data=await response.json();
  const c=data.current;
  if(!c||![c.temperature_2m,c.relative_humidity_2m,c.wind_speed_10m,c.weather_code].every(v=>typeof v==='number'&&Number.isFinite(v))||typeof c.time!=='string')throw new Error('Weather data unavailable');
  return {temperature:c.temperature_2m,humidity:c.relative_humidity_2m,wind:c.wind_speed_10m,condition:weatherCondition(c.weather_code),observedAt:c.time};
}
