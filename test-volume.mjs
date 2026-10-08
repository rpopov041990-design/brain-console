import assert from 'node:assert/strict';
import {cameraHome,worldPosition,volumeLayout,volumeScene,projectVolume,pickVolume,makeCosmicDust} from './src/volume-model.js';
const nodes=[{id:'a',kind:'TaskPersona',team:'A'},{id:'b',kind:'TaskPersona',team:'B'},{id:'t',kind:'TaskTeam',name:'A'},{id:'s',kind:'TaskCapability'}];
const edges=[{id:'as',source:'a',target:'s'},{id:'at',source:'a',target:'t',type:'MEMBER_OF'},{id:'broken',source:'a',target:'absent'},{id:'old',source:'a',target:'b',invalidAt:'2026'}];
const layout=volumeLayout(nodes),original=JSON.stringify(nodes);
assert.deepEqual(worldPosition('a'),volumeLayout([{...nodes[0],team:'B'}]).positions.get('a'),'category may not alter position');
assert.deepEqual(layout.positions.get('a'),volumeLayout([...nodes,{id:'new',kind:'TaskPersona'}]).positions.get('a'));
const all=volumeScene(nodes,edges,null,layout,true,'',true),filtered=volumeScene(nodes,edges,null,layout,false,'A',false);
assert.equal(all.drawn.length,4);assert.equal(all.links.length,2);assert.equal(filtered.drawn.length,2);assert.equal(filtered.positions.get('a'),layout.positions.get('a'));
const selected=volumeScene(nodes,edges,'a',layout,false,'',false);assert.equal(selected.links.length,2);assert.ok(selected.drawn.some(n=>n.id==='s'));
assert.equal(JSON.stringify(nodes),original);
const p=worldPosition('a'),home=projectVolume(p,cameraHome,1600,1000),rotated=projectVolume(p,{...cameraHome,yaw:cameraHome.yaw+.6},1600,1000);
assert.notDeepEqual(home,rotated);assert.notEqual(home.depth,rotated.depth);
assert.ok(!projectVolume([0,0,-2000],{...cameraHome,yaw:0,pitch:0},1600,1000).visible);
assert.equal(pickVolume(nodes,layout.positions,cameraHome,1600,1000,home.x,home.y)?.id,'a');
const fly=projectVolume(p,{...cameraHome,target:p,zoom:3.2},1600,1000);assert.equal(fly.x,800);assert.equal(fly.y,500);
const dust=makeCosmicDust();assert.ok(dust.length>15000);assert.ok(new Set(dust.map(d=>Math.round(d.p[2]))).size>500);assert.deepEqual(dust[0],makeCosmicDust()[0]);
if(process.argv.includes('--live')){const d=await fetch(`${process.env.BRAIN_TEST_URL||'http://127.0.0.1:8770'}/api/snapshot?scope=pinned`).then(r=>{assert.ok(r.ok,`HTTP ${r.status}`);return r.json()}),l=volumeLayout(d.nodes),s=volumeScene(d.nodes,d.edges,null,l,true,'',true);assert.equal(s.drawn.length,d.nodes.length);assert.equal(s.links.length,d.edges.filter(e=>!e.invalidAt).length);console.log(JSON.stringify({nodes:s.drawn.length,links:s.links.length,agents:d.nodes.filter(n=>n.kind==='TaskPersona').length,teams:l.teams.length,graph:d.graphAvailable}));}
console.log('PASS: category-independent 3D coordinates, growth, real links, shared camera, clipping, picking, fly-to, volumetric dust');
