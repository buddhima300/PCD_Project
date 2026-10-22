export interface ChartPoint {label:string;value:number}
export function DashboardChart({data,label,kind='bar'}:{data:ChartPoint[];label:string;kind?:'bar'|'histogram'|'line'}) {
  const max=Math.max(2,Math.ceil(Math.max(0,...data.map(d=>d.value))/2)*2),width=560,height=190,left=30,top=12,bottom=35,plotWidth=width-left-12,plotHeight=height-top-bottom;
  const step=plotWidth/Math.max(1,data.length),x=(i:number)=>left+step*(i+.5),y=(n:number)=>top+plotHeight*(1-n/max);
  return <figure className="min-w-0"><svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={label}>
    {[0,.5,1].map(n=><g key={n}><line x1={left} x2={width-12} y1={y(n*max)} y2={y(n*max)} stroke="currentColor" opacity=".12"/><text x={left-6} y={y(n*max)+4} textAnchor="end" fill="currentColor" fontSize="10">{Number((n*max).toFixed(1))}</text></g>)}
    {kind==='line'&&<polyline points={data.map((d,i)=>`${x(i)},${y(d.value)}`).join(' ')} fill="none" stroke="var(--dashboard-chart-color, #a3e635)" strokeWidth="2.5"/>}
    {data.map((d,i)=><g key={`${d.label}-${i}`}>
      {kind==='line'?<circle cx={x(i)} cy={y(d.value)} r="3" fill="#a3e635"><title>{d.label}: {d.value}</title></circle>:<rect x={left+step*i+(kind==='histogram'?0:step*.15)} y={y(d.value)} width={step*(kind==='histogram'?1:.7)} height={plotHeight*d.value/max} rx={kind==='histogram'?0:3} fill={kind==='histogram'?'#a78bfa':'#fb923c'} opacity=".85"><title>{d.label}: {d.value}</title></rect>}
      {(data.length<=8||i===0||i===data.length-1||i===Math.floor(data.length/2))&&<text x={x(i)} y={height-15} fill="currentColor" fontSize="10" textAnchor="middle">{d.label.length>12?d.label.slice(0,11)+'…':d.label}</text>}
    </g>)}
  </svg><figcaption className="sr-only">{label}</figcaption><div className="sr-only"><table><caption>{label} data</caption><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>{data.map((d,i)=><tr key={i}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody></table></div></figure>;
}
