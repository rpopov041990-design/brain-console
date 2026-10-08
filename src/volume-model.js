import {hash,active} from './model.js';
export const cameraHome={yaw:.12,pitch:-.28,zoom:1,panX:0,panY:0,target:[0,0,0]};
const unit=(id,suffix)=>hash(id+suffix)/4294967296;
// Identity, not team, defines a location in the shared volume. Categories never move objects.
export function worldPosition(id){const r=140+Math.sqrt(unit(id,'radius'))*720,a=unit(id,'angle')*Math.PI*2;return [Math.cos(a)*r,Math.sin(a)*r*.63,(unit(id,'depth')-.5)*560]}
export function volumeLayout(nodes){const positions=new Map(nodes.map(n=>[n.id,worldPosition(n.id)]));const teams=nodes.filter(n=>n.kind==='TaskTeam').map(n=>({...n,members:nodes.filter(a=>a.kind==='TaskPersona'&&a.team===n.name)}));return{positions,teams}}
export function volumeScene(nodes,edges,selected,layout,showAll,category,showMemory){
 const incident=edges.filter(e=>active(e)&&(e.source===selected||e.target===selected)),neighbors=new Set(incident.flatMap(e=>[e.source,e.target]));
 const drawn=nodes.filter(n=>showMemory||n.kind==='TaskPersona'||n.id===selected||neighbors.has(n.id));
 const ids=new Set(drawn.map(n=>n.id)),team=layout.teams.find(t=>t.name===category),highlighted=new Set(team?.members.map(n=>n.id)||[]);
 if(team)highlighted.add(team.id);
 const links=edges.filter(e=>active(e)&&ids.has(e.source)&&ids.has(e.target)&&(showAll||e.source===selected||e.target===selected||(category&&e.type==='MEMBER_OF'&&(e.source===team?.id||e.target===team?.id))));
 return{drawn,links,highlighted,positions:layout.positions};
}
export function projectVolume(p,camera,width,height){
 const t=camera.target||[0,0,0],px=p[0]-t[0],py=p[1]-t[1],pz=p[2]-t[2],cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
 const x=px*cy+pz*sy,z=-px*sy+pz*cy,y=py*cp-z*sp,depth=py*sp+z*cp,denom=1400/camera.zoom+depth,fit=Math.min(width/1600,height/1000),scale=1400/Math.max(80,denom)*fit;
 return{x:width/2+x*scale+camera.panX*fit,y:height/2+y*scale+camera.panY*fit,scale,depth:denom,visible:denom>80&&denom<8000};
}
export function pickVolume(nodes,positions,camera,width,height,x,y){
 return nodes.map(n=>({n,p:projectVolume(positions.get(n.id),camera,width,height)})).filter(({n,p})=>p.visible&&Math.hypot(p.x-x,p.y-y)<=Math.max(7,(n.kind==='TaskPersona'?10:4)*p.scale)).sort((a,b)=>a.p.depth-b.p.depth)[0]?.n;
}
export function makeCosmicDust(){
 let seed=713903;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};const particles=[];
 // One continuous, warped galactic volume, shared by every data object and camera.
 for(let i=0;i<16500;i++){const r=Math.pow(random(),.62)*1120,a=(i%4)*Math.PI/2+r*.006+(random()-.5)*.8,z=(random()-.5)*(55+r*.14);const warm=r<340||i%9===0;particles.push({p:[Math.cos(a)*r,Math.sin(a)*r*.63,z+Math.sin(a*2)*90],c:warm?[1,.66,.35]:[.46,.69,1],size:i%29===0?4.8:1.4+random()*1.7,kind:-1,alpha:.35+random()*.55})}
 for(let i=0;i<650;i++)particles.push({p:[(random()-.5)*3100,(random()-.5)*2100,(random()-.5)*1900],c:i%3?[.65,.81,1]:[1,.7,.4],size:i%13===0?4:1+random(),kind:-1,alpha:.45});
 for(let i=0;i<120;i++){const a=random()*Math.PI*2,r=random()*850;particles.push({p:[Math.cos(a)*r,Math.sin(a)*r*.65,(random()-.5)*200],c:i%3?[.14,.3,.55]:[.48,.25,.11],size:45+random()*90,kind:-1,alpha:.055})}
 return particles;
}
