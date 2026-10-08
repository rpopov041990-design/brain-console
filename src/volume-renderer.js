import {makeCosmicDust} from './volume-model.js';
import {hash} from './model.js';
const common=`
uniform vec2 viewport;uniform vec4 camera;uniform vec2 pan;uniform vec3 target;
vec3 rotatePoint(vec3 p){p-=target;float cy=cos(camera.x),sy=sin(camera.x),cp=cos(camera.y),sp=sin(camera.y);float x=p.x*cy+p.z*sy,z=-p.x*sy+p.z*cy;return vec3(x,p.y*cp-z*sp,p.y*sp+z*cp);}
vec4 projection(vec3 p){vec3 v=rotatePoint(p);float d=1400./camera.z+v.z,f=1400./max(80.,d),fit=min(viewport.x/1600.,viewport.y/1000.);return vec4((v.x*f+pan.x)*fit*2./viewport.x,-(v.y*f+pan.y)*fit*2./viewport.y,(d-80.)/7920.*2.-1.,f*fit);}
`;
const vertex=`#version 300 es
precision highp float;
layout(location=0)in vec2 corner;layout(location=1)in vec3 position;layout(location=2)in vec3 color;layout(location=3)in vec4 spec;
${common}
out vec2 uv;out vec3 tint;out vec4 options;out float seed;
void main(){vec4 p=projection(position);uv=corner;tint=color;options=spec;seed=position.x+position.y;vec2 delta=corner*spec.x*p.w*2./viewport;gl_Position=vec4(p.xy+delta,p.z,1.);if(p.z < -1. || p.z > 1.)gl_Position=vec4(3.,3.,3.,1.);}
`;
const fragment=`#version 300 es
precision highp float;in vec2 uv;in vec3 tint;in vec4 options;in float seed;out vec4 outColor;uniform float time;uniform vec3 light;
void main(){float q=dot(uv,uv);if(q>1.)discard;
 if(options.y<.5){float glow=exp(-q*3.5)*(1.-smoothstep(.7,1.,q));float pulse=.9+.1*sin(time*.6+seed);outColor=vec4(tint*(options.y<0.?1.5:1.),glow*options.z*pulse);}
 else{float z=sqrt(1.-q);vec3 normal=normalize(vec3(uv.x,-uv.y,z));float diffuse=max(0.,dot(normal,normalize(light)));float bands=.94+.06*sin(uv.y*21.+sin(uv.x*13.+seed));vec3 rgb=tint*(.12+.88*diffuse)*bands+vec3(pow(max(0.,dot(normal,normalize(light+vec3(0,0,1)))),30.)*.35);if(options.w>.5&&q>.76)rgb=mix(rgb,vec3(1.,.83,.48),.9);outColor=vec4(rgb,1.);}
 if(outColor.a<.004)discard;
}
`;
const lineVertex=`#version 300 es
precision highp float;layout(location=0)in vec3 position;layout(location=1)in vec4 color;${common}out vec4 tint;void main(){vec4 p=projection(position);gl_Position=vec4(p.xyz,1.);tint=color;}`;
const lineFragment=`#version 300 es
precision highp float;in vec4 tint;out vec4 outColor;void main(){outColor=tint;}`;
export function createVolumeRenderer(canvas){
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL 2 недоступен. Используйте тему «Мозг» или список агентов.');
 const resources=[];
 function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(message)}resources.push(['Shader',s]);return s}
 function program(v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));resources.push(['Program',p]);return p}
 const particles=program(vertex,fragment),lines=program(lineVertex,lineFragment),uniforms=new Map();
 for(const p of[particles,lines])uniforms.set(p,Object.fromEntries(['viewport','camera','pan','target','time','light'].map(n=>[n,gl.getUniformLocation(p,n)])));
 function buffer(data){const b=gl.createBuffer();resources.push(['Buffer',b]);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);return b}
 function batch(data){const vao=gl.createVertexArray();resources.push(['VertexArray',vao]);gl.bindVertexArray(vao);buffer(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]));gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);const b=buffer(new Float32Array(data));for(const[index,size,offset]of[[1,3,0],[2,3,12],[3,4,24]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,40,offset);gl.vertexAttribDivisor(index,1)}return{vao,buffer:b,count:data.length/10}}
 const pack=items=>items.flatMap(x=>[...x.p,...x.c,x.size,x.kind,x.alpha??1,x.selected?1:0]);
 const dust=batch(pack(makeCosmicDust())),objects=batch([]),lineVAO=gl.createVertexArray();resources.push(['VertexArray',lineVAO]);gl.bindVertexArray(lineVAO);const lineBuffer=buffer(new Float32Array());gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,28,12);let lineCount=0;
 function setScene(scene,selected){
  const items=scene.drawn.map(n=>{const palette=[[.35,.65,.83],[.78,.52,.3],[.57,.67,.48],[.67,.55,.79],[.75,.72,.6]],agent=n.kind==='TaskPersona',chosen=n.id===selected,bright=chosen||scene.highlighted.has(n.id);return{p:scene.positions.get(n.id),c:agent?palette[hash(n.id)%palette.length]:bright?[1,.79,.4]:[.44,.72,.88],size:agent?(chosen?14:10):bright?7:3.7,kind:agent?1:0,alpha:bright?1:.85,selected:bright}});
  gl.bindBuffer(gl.ARRAY_BUFFER,objects.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pack(items)),gl.DYNAMIC_DRAW);objects.count=items.length;
  const vertices=scene.links.flatMap(e=>{const incident=e.source===selected||e.target===selected,a=scene.positions.get(e.source),b=scene.positions.get(e.target),c=incident?[.57,.85,1,.75]:[.4,.64,.82,.11];return[...a,...c,...b,...c]});gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);lineCount=vertices.length/7;
 }
 function setup(p,c,w,h,time){gl.useProgram(p);const u=uniforms.get(p);gl.uniform2f(u.viewport,w,h);gl.uniform4f(u.camera,c.yaw,c.pitch,c.zoom,0);gl.uniform2f(u.pan,c.panX,c.panY);gl.uniform3fv(u.target,c.target||[0,0,0]);if(u.time)gl.uniform1f(u.time,time);if(u.light)gl.uniform3f(u.light,-.7*Math.cos(c.yaw),.65,.7+.4*Math.sin(c.yaw))}
 function draw(c,time=0){const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const pw=Math.round(w*dpr),ph=Math.round(h*dpr);if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph}gl.viewport(0,0,pw,ph);gl.clearColor(.002,.005,.012,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);setup(particles,c,w,h,time);gl.depthMask(false);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.bindVertexArray(dust.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,dust.count);gl.depthMask(true);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.bindVertexArray(objects.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,objects.count);gl.depthMask(false);setup(lines,c,w,h,time);gl.bindVertexArray(lineVAO);gl.drawArrays(gl.LINES,0,lineCount);gl.depthMask(true);canvas.dataset.renderedObjects=String(objects.count);canvas.dataset.renderedLinks=String(lineCount/2);canvas.dataset.cameraYaw=c.yaw.toFixed(4);}
 return{setScene,draw,dispose(){for(const[k,o]of resources.reverse())gl['delete'+k](o)}};
}
