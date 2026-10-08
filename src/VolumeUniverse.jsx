import React,{useEffect,useMemo,useRef,useState} from 'react';
import {cameraHome,volumeLayout,volumeScene,projectVolume,pickVolume} from './volume-model';
import {createVolumeRenderer} from './volume-renderer';
import './universe.css';
import './volume.css';

export function Universe({nodes,allNodes=nodes,edges,selected,onSelect,scope}){
 const[camera,setCamera]=useState({...cameraHome}),[auto,setAuto]=useState(false),[allLinks,setAllLinks]=useState(true),[memory,setMemory]=useState(true),[category,setCategory]=useState(''),[expanded,setExpanded]=useState(false),[mode,setMode]=useState('rotate'),[motion,setMotion]=useState(true),[hover,setHover]=useState(null),[error,setError]=useState(''),[size,setSize]=useState([800,550]),[visible,setVisible]=useState(!document.hidden),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const canvas=useRef(null),renderer=useRef(null),drag=useRef(null),current=useRef(null),[ready,setReady]=useState(0);
 const layout=useMemo(()=>volumeLayout(allNodes),[allNodes]);
 const scene=useMemo(()=>volumeScene(nodes,edges,selected,layout,allLinks,category,memory),[nodes,edges,selected,layout,allLinks,category,memory]);
 const byId=useMemo(()=>new Map(nodes.map(n=>[n.id,n])),[nodes]);
 current.current={camera,scene,selected};
 useEffect(()=>{
  const el=canvas.current;let instance;
  const init=()=>{try{instance=createVolumeRenderer(el);renderer.current=instance;setError('');setReady(v=>v+1)}catch(e){setError('3D-сцена недоступна: '+e.message)}};
  const lost=e=>{e.preventDefault();renderer.current=null;setAuto(false);setError('Графический контекст потерян. Ожидаю восстановления; данные доступны в списках.')},restored=()=>{instance?.dispose();init()};
  init();el.addEventListener('webglcontextlost',lost);el.addEventListener('webglcontextrestored',restored);
  const resize=new ResizeObserver(()=>setSize([el.clientWidth,el.clientHeight]));resize.observe(el);
  return()=>{resize.disconnect();el.removeEventListener('webglcontextlost',lost);el.removeEventListener('webglcontextrestored',restored);instance?.dispose();renderer.current=null};
 },[]);
 useEffect(()=>{renderer.current?.setScene(scene,selected);renderer.current?.draw(camera)},[scene,selected,ready]);
 useEffect(()=>{renderer.current?.draw(camera)},[camera,size,ready]);
 useEffect(()=>{const change=()=>setVisible(!document.hidden),media=matchMedia('(prefers-reduced-motion: reduce)'),reduce=()=>setReduced(media.matches);document.addEventListener('visibilitychange',change);media.addEventListener('change',reduce);return()=>{document.removeEventListener('visibilitychange',change);media.removeEventListener('change',reduce)}},[]);
 useEffect(()=>{if(!auto||!motion||!visible||reduced||error)return;let frame,last=0;const tick=t=>{if(t-last>=33){const dt=last?Math.min(t-last,100):0;last=t;setCamera(c=>({...c,yaw:c.yaw+dt*.000035}))}frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame)},[auto,motion,visible,reduced,error]);
 useEffect(()=>{if(selected)setAuto(false)},[selected]);
 useEffect(()=>{const key=e=>{if(e.key==='Escape')setExpanded(false)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
 function zoom(f){setAuto(false);setCamera(c=>({...c,zoom:Math.min(5,Math.max(.5,c.zoom*f))}))}
 useEffect(()=>{const el=canvas.current,wheel=e=>{e.preventDefault();zoom(e.deltaY<0?1.08:.925)};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)},[]);
 function reset(){setAuto(false);setCamera({...cameraHome});setHover(null)}
 function fly(){const p=scene.positions.get(selected);if(!p)return;setAuto(false);setCamera(c=>({...c,target:[...p],zoom:3.2,panX:0,panY:0}))}
 function start(e){if(e.button!==0)return;setAuto(false);drag.current={x:e.clientX,y:e.clientY,camera,mode:e.shiftKey?'pan':mode,moved:false};e.currentTarget.setPointerCapture(e.pointerId)}
 function move(e){const d=drag.current,rect=e.currentTarget.getBoundingClientRect();if(!d){const n=pickVolume(scene.drawn,scene.positions,camera,rect.width,rect.height,e.clientX-rect.left,e.clientY-rect.top);setHover(n?.id||null);return}const dx=e.clientX-d.x,dy=e.clientY-d.y;d.moved=d.moved||Math.hypot(dx,dy)>4;if(d.mode==='pan'){const fit=Math.min(rect.width/1600,rect.height/1000);setCamera({...d.camera,panX:d.camera.panX+dx/fit,panY:d.camera.panY+dy/fit})}else setCamera({...d.camera,yaw:d.camera.yaw+dx*.006,pitch:Math.max(-1.45,Math.min(1.45,d.camera.pitch+dy*.006))})}
 function end(e){const d=drag.current;drag.current=null;if(d&&!d.moved){const rect=e.currentTarget.getBoundingClientRect(),n=pickVolume(scene.drawn,scene.positions,camera,rect.width,rect.height,e.clientX-rect.left,e.clientY-rect.top);if(n)onSelect(n.id)}}
 function keyboard(e){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setAuto(false);setCamera(c=>({...c,yaw:c.yaw+(e.key==='ArrowRight'?.12:e.key==='ArrowLeft'?-.12:0),pitch:Math.max(-1.45,Math.min(1.45,c.pitch+(e.key==='ArrowDown'?.1:e.key==='ArrowUp'?-.1:0)))}))}else if(e.key==='+'||e.key==='=')zoom(1.15);else if(e.key==='-')zoom(.87)}
 const named=scene.drawn.filter(n=>n.id===selected||n.id===hover||scene.highlighted.has(n.id));
 return <section className={'canvas-panel space-panel universe-panel '+(expanded?'galaxy-expanded':'')} aria-label="Объёмная вселенная">
  <div className="space-heading"><div><span className="space-eyebrow">ПРОСТРАНСТВО ПАМЯТИ / 3D</span><h1>Наша вселенная</h1><p>Агенты, знания и связи — объекты одного пространства.</p></div><button className="expand-map" onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть ↙':'Развернуть ↗'}</button></div>
  <div className="universe-tools">
   {scope==='pinned'&&<select aria-label="Подсветить созвездие" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Без подсветки категорий</option>{layout.teams.map(t=><option key={t.id}>{t.name}</option>)}</select>}
   <div className="view-modes" role="group" aria-label="Управление камерой"><button aria-pressed={mode==='rotate'} onClick={()=>setMode('rotate')}>Вращать</button><button aria-pressed={mode==='pan'} onClick={()=>setMode('pan')}>Сдвигать</button></div>
   <button className="auto-orbit" aria-pressed={auto} disabled={reduced||!motion||!!error} onClick={()=>setAuto(v=>!v)}>{auto?'Ⅱ Пауза':'↻ Автовращение'}</button>
   <label><input type="checkbox" checked={allLinks} onChange={e=>setAllLinks(e.target.checked)}/> Все связи</label><label><input type="checkbox" checked={memory} onChange={e=>setMemory(e.target.checked)}/> Узлы памяти</label><label><input type="checkbox" checked={motion} onChange={e=>{setMotion(e.target.checked);if(!e.target.checked)setAuto(false)}}/> Анимация</label>
  </div>
  <div className="volume-viewport"><canvas ref={canvas} className="volume-canvas" aria-label="3D-вселенная: тяните для вращения, колесо для приближения, стрелки для поворота" tabIndex="0" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null}} onPointerLeave={()=>{if(!drag.current)setHover(null)}} onKeyDown={keyboard}/>
   <div className="volume-labels" aria-hidden="true">{named.map(n=>{const p=projectVolume(scene.positions.get(n.id),camera,...size);if(!p.visible||p.x<0||p.x>size[0]||p.y<0||p.y>size[1])return null;return <span key={n.id} data-label-id={n.id} className={n.id===selected?'selected':''} style={{left:p.x,top:p.y+Math.max(12,12*p.scale)}}>{n.name}</span>})}</div>
   {error&&<div className="volume-error" role="alert">{error}</div>}
   <div className="universe-caption">{scene.drawn.filter(n=>n.kind==='TaskPersona').length} агентов · {scene.drawn.length} объектов · {scene.links.length} связей<small>Тянуть — {mode==='rotate'?'вращать':'сдвигать'} · колесо — подлететь · Shift — сдвиг</small></div>
  </div>
  <div className="canvas-bottom"><div className="legend"><span>● Планеты — агенты</span><span>✦ Звёзды — записи графа</span><span>Категории только подсвечиваются</span></div><div className="volume-navigation"><button disabled={!selected} onClick={fly}>К объекту ↗</button><div className="zoom"><button aria-label="Отдалиться" onClick={()=>zoom(.8)}>−</button><button aria-label="Вернуться к общему виду" onClick={reset}>Общий вид</button><button aria-label="Приблизиться" onClick={()=>zoom(1.25)}>+</button></div></div></div>
  {selected&&<div className="expanded-selection"><strong>{byId.get(selected)?.name}</strong><span>{byId.get(selected)?.role}</span>{expanded&&<button onClick={()=>setExpanded(false)}>Профиль и связи →</button>}</div>}
  <p className="canvas-note">Показан текущий структурный слой графа; полный поиск — «Память». Положение не зависит от категории. Звёздная пыль декоративна и движется той же камерой. Вращение не означает работу агентов.{reduced?' Системная настройка уменьшения движения включена.':''}</p>
 </section>;
}
