import React,{useState} from 'react';
import {Universe} from './VolumeUniverse';
import './space.css';

const THEME_KEY='brain-console.theme.v1';
export function ThemedMap({neural,...props}){
 const[theme,setTheme]=useState(()=>{try{return localStorage.getItem(THEME_KEY)==='brain'?'brain':'space'}catch{return 'space'}});
 function choose(value){setTheme(value);try{localStorage.setItem(THEME_KEY,value)}catch{}}
 return <div className={'themed-map theme-'+theme}>
  <div className="theme-switch"><span>Тема карты</span><div role="group" aria-label="Тема карты"><button aria-pressed={theme==='brain'} onClick={()=>choose('brain')}>◉ Мозг</button><button aria-pressed={theme==='space'} onClick={()=>choose('space')}>✧ Космос</button></div></div>
  {theme==='brain'?neural:<Universe key={props.scope} {...props}/>}
 </div>;
}
