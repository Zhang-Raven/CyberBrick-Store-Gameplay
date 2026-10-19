import fs from 'node:fs/promises';
import JSZip from 'jszip';

// Render actual extrusion paths from the first two layers; exclude purge towers.
export async function renderToolpathPreview(filePath,plateIndex,name) {
  const zip=await JSZip.loadAsync(await fs.readFile(filePath));
  const code=await zip.file(`Metadata/plate_${plateIndex+1}.gcode`).async('string');
  const colours=(/^; filament_colour = (.+)$/m.exec(code)?.[1] || '#0A2989,#FFFFFF').split(/[;,]/).map(c=>/^#[0-9a-f]{6}$/i.test(c.trim())?c.trim():'#808080');
  let x=0,y=0,e=0,relative=true,tool=0,width=.4,layerCount=0,feature='Custom';
  const paths=[],points=[];
  for(const raw of code.split('\n')) {
    if(raw.trim()==='; CHANGE_LAYER')layerCount++;
    if(raw.startsWith('; FEATURE:')) feature=raw.split(':')[1].trim();
    if(raw.startsWith('; LINE_WIDTH:')) width=Number(raw.split(':')[1]);
    if(/^;VT[01]\b/.test(raw)) tool=Number(raw[3]);
    const line=raw.split(';')[0].trim();
    if(!line)continue;
    const command=line.split(/\s+/)[0];
    const params=Object.fromEntries([...line.matchAll(/([XYZEFIJP])(-?(?:\d*\.)?\d+)/g)].map(m=>[m[1],Number(m[2])]));
    if(command==='M83')relative=true;
    if(command==='M82')relative=false;
    if(/^T[01]$/.test(command))tool=Number(command.slice(1));
    if(command==='G92'&&params.E!==undefined)e=params.E;
    if(!['G0','G1','G2','G3'].includes(command))continue;
    const nx=params.X??x,ny=params.Y??y;
    const extrusion=params.E===undefined?0:relative?params.E:params.E-e;
    if(params.E!==undefined)e=relative?e+params.E:params.E;
    if(extrusion>0&&layerCount>0&&layerCount<=2&&!['Prime tower','Custom','Skirt','Brim'].includes(feature)&&(nx!==x||ny!==y)) {
      const vertices=[[x,y]];
      if(['G2','G3'].includes(command)&&params.I!==undefined&&params.J!==undefined) {
        const cx=x+params.I,cy=y+params.J,r=Math.hypot(params.I,params.J);
        const start=Math.atan2(y-cy,x-cx),end=Math.atan2(ny-cy,nx-cx);
        let delta=end-start;
        if(command==='G2'){while(delta>=0)delta-=2*Math.PI;}else{while(delta<=0)delta+=2*Math.PI;}
        const count=Math.min(512,Math.max(2,Math.ceil(Math.abs(delta)*r/.25)));
        for(let i=1;i<count;i++){const angle=start+delta*i/count;vertices.push([cx+r*Math.cos(angle),cy+r*Math.sin(angle)]);}
      }
      vertices.push([nx,ny]);points.push(...vertices);
      paths.push(`<path d="M${vertices.map(p=>p.map(n=>n.toFixed(3)).join(',')).join(' L')}" stroke="${colours[tool]||'#808080'}" stroke-width="${width}"/>`);
    }
    x=nx;y=ny;
  }
  if(!points.length)throw new Error(`${name} 没有可显示的切片路径`);
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  for(const [px,py] of points){xmin=Math.min(xmin,px);ymin=Math.min(ymin,py);xmax=Math.max(xmax,px);ymax=Math.max(ymax,py);}
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${xmin-2} ${ymin-2} ${xmax-xmin+4} ${ymax-ymin+4}"><title>${name} · 蓝白 PLA 前两层切片预览</title><g transform="translate(0 ${ymin+ymax}) scale(1 -1)" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g></svg>`;
  return svg;
}
