"""Loopback-only, read-only adapter for the agent registry and Neo4j.

No arbitrary queries, credentials in responses, telemetry, or task scheduling.
"""
import argparse
import hashlib
import json
import mimetypes
import os
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
REGISTRY = None
PINS = None
STRUCTURAL = ['TaskPersona','TaskTeam','TaskCapability','TaskSupervisor','TaskReviewer','TaskService','TaskPriority','ThinkingProfile','TaskProgressPolicy','CodexTask']
GLOBAL = ['EvolutionRoot','ImprovementArea','LearnedLesson','LessonEvaluation','ReusableSkill','LearningMechanism','AIPersona','EgorCompetency','CompetencyPlan','CompetencyEvaluation']
TITLES = {'MEMBER_OF':'Состоит в команде','HAS_CAPABILITY':'Применяет навык','VERIFIED_COLLABORATION':'Подтверждённое сотрудничество','SUPERVISES':'Координирует','REVIEWS':'Проверяет','USES_THINKING_PROFILE':'Профиль мышления','HAS_DEFAULT_PRIORITY':'Приоритет','USES_SHARED_MEMORY':'Общая память','HAS_LESSON':'Урок опыта','HAS_AREA':'Направление','USES_MECHANISM':'Механизм развития','TESTED_BY':'Проверено','BECOMES_SKILL':'Преобразован в навык','COLLABORATES_THROUGH':'Маршрут сотрудничества','HAS_RESULT':'Результат','MENTIONS':'Упоминание','RELATES_TO':'Связано с','HAS_UPDATE':'Обновление','HAS_COMPETENCY':'Компетенция','DEVELOPS_WITH':'Развивается через','MEASURED_BY':'Оценка','HAS_TOPIC':'Раздел памяти','HAS_HOME_TASK':'Основной чат','REPORTS_PROGRESS_WITH':'Правило прогресса'}
LOCK = threading.Lock()
CACHE = {}


def now():
    return datetime.now(timezone.utc).isoformat()


def string(value):
    return str(value) if value is not None else ''


def label_id(prefix, value):
    return prefix+':'+str(value)


def graph_rows(driver, scope):
    from neo4j import Query
    labels = GLOBAL if scope == 'global' else STRUCTURAL
    group = 'codex-global' if scope == 'global' else 'codex-pinned'
    with driver.session(database=driver.database_name, default_access_mode='READ') as s:
        nodes = s.run(Query('''MATCH(n) WHERE n.group_id=$group AND any(l IN labels(n) WHERE l IN $labels)
RETURN n.uuid AS uuid, n.thread_id AS thread, labels(n) AS labels,
coalesce(n.persona_name,n.display_name,n.name,'Без названия') AS name,
coalesce(n.persona_role,'') AS role, coalesce(n.persona_team,'') AS team,
coalesce(n.status,'') AS status, coalesce(n.summary,'') AS summary,
n.created_at AS created ORDER BY n.uuid LIMIT 10001''',timeout=6),group=group,labels=labels).data()
        truncated = len(nodes)>10000
        nodes = nodes[:10000]
        ids = [n['uuid'] for n in nodes if n['uuid']]
        edges = s.run(Query('''MATCH(a)-[r]->(b) WHERE a.group_id=$group AND b.group_id=$group
AND a.uuid IN $ids AND b.uuid IN $ids
RETURN coalesce(r.uuid,elementId(r)) AS id,a.uuid AS source,b.uuid AS target,type(r) AS type,
coalesce(r.name,type(r)) AS label,r.created_at AS created,r.invalid_at AS invalidAt
ORDER BY id LIMIT 20001''',timeout=6),group=group,ids=ids).data()
        truncated = truncated or len(edges)>20000
    return nodes,edges[:20000],truncated


def make_snapshot(reg, graph, scope, pinned):
    raw_nodes,raw_edges,truncated = graph
    nodes,edges,mapping = {},{},{}
    def edge(source,target,kind,label,origin,**extra):
        if source not in nodes or target not in nodes:
            return
        key = '\0'.join([source,target,kind,label,extra.get('invalidAt','')])
        eid = hashlib.sha256(key.encode()).hexdigest()[:24]
        if eid not in edges:
            edges[eid] = dict(id=eid,source=source,target=target,type=kind,label=label,sources=[],**extra)
        if origin not in edges[eid]['sources']:
            edges[eid]['sources'].append(origin)
    if scope == 'pinned':
        for tid,p in reg.get('personas',{}).items():
            aid = label_id('agent',tid)
            nodes[aid] = dict(id=aid,name=p.get('name',tid),kind='TaskPersona',role=p.get('role',''),project=p.get('project',''),team=p.get('team','Прочее'),traits=p.get('traits',[]),capabilities=p.get('capabilities',[]),execution=p.get('execution',{}),threadId=tid,pinned=tid in pinned,sources=['Реестр'],inGraph=False)
        for tid,p in reg.get('personas',{}).items():
            aid = label_id('agent',tid)
            team = p.get('team','Прочее'); t=label_id('team',team)
            nodes.setdefault(t,dict(id=t,name=team,kind='TaskTeam',sources=['Реестр']))
            edge(aid,t,'MEMBER_OF',TITLES['MEMBER_OF'],'Реестр')
            for cap in p.get('capabilities',[]):
                cap = str(cap); cid=label_id('skill',cap)
                nodes.setdefault(cid,dict(id=cid,name=cap,kind='TaskCapability',sources=['Реестр']))
                edge(aid,cid,'HAS_CAPABILITY',TITLES['HAS_CAPABILITY'],'Реестр')
        for route in reg.get('verified_collaboration_routes',{}).get('routes',{}).values():
            if route.get('status')!='verified':
                continue
            a=label_id('agent',route.get('source_thread_id')); b=label_id('agent',route.get('target_thread_id'))
            edge(a,b,'VERIFIED_COLLABORATION',route.get('label',TITLES['VERIFIED_COLLABORATION']),'Реестр',bidirectional=route.get('direction')=='bidirectional')
    for n in raw_nodes:
        labs=n['labels']; kind=next((x for x in (STRUCTURAL if scope=='pinned' else GLOBAL) if x in labs),labs[0])
        name=string(n['name'])
        nid=label_id('neo',n['uuid'])
        if kind=='TaskPersona' and n['thread']:
            nid=label_id('agent',n['thread'])
        elif kind=='TaskTeam': nid=label_id('team',name)
        elif kind=='TaskCapability': nid=label_id('skill',name)
        mapping[n['uuid']]=nid
        if nid not in nodes:
            nodes[nid]=dict(id=nid,name=name,kind=kind,role=string(n['role']),team=string(n['team']),sources=[],inRegistry=False,status=string(n['status']),summary=string(n['summary']))
        node=nodes[nid]
        if 'Neo4j' not in node['sources']: node['sources'].append('Neo4j')
        node.update(inGraph=True,uuid=n['uuid'],created=string(n['created']))
    for e in raw_edges:
        label=TITLES.get(e['type'],e['label'])
        edge(mapping.get(e['source']),mapping.get(e['target']),e['type'],label,'Neo4j',created=string(e['created']),invalidAt=string(e['invalidAt']),databaseId=e['id'])
    return dict(nodes=list(nodes.values()),edges=list(edges.values()),truncated=truncated,registryCount=len(reg.get('personas',{})) if scope=='pinned' else 0,graphNodeCount=len(raw_nodes),supervisor=reg.get('supervisor',{}).get('name',''),reviewer=reg.get('quality_reviewer',{}).get('name',''))


def snapshot(driver,scope):
    if driver is None:
        from demo import demo_snapshot
        return demo_snapshot(scope)
    with LOCK:
        cached=CACHE.get(scope)
        if cached and time.monotonic()-cached[0]<5:
            return cached[1]
        reg=json.loads(REGISTRY.read_text(encoding='utf-8'))
        pins=json.loads(PINS.read_text(encoding='utf-8')).get('pinned-thread-ids',[]) if PINS else []
        graph_ok=True
        try: graph=graph_rows(driver,scope)
        except Exception:
            graph_ok=False; graph=([],[],False)
        data=make_snapshot(reg,graph,scope,pins)
        data.update(scope=scope,graphAvailable=graph_ok,fetchedAt=now(),registryUpdatedAt=reg.get('updated_at'),pollSeconds=30)
        signature={k:v for k,v in data.items() if k!='fetchedAt'}
        data['version']=hashlib.sha256(json.dumps(signature,sort_keys=True,default=str).encode()).hexdigest()
        CACHE[scope]=(time.monotonic(),data)
        return data


def memory_search(driver,scope,q,offset):
    if driver is None:
        data=snapshot(None,scope)
        rows=[dict(uuid=n['uuid'],name=n['name'],labels=[n['kind']]) for n in data['nodes'] if q.casefold() in n['name'].casefold()]
        return dict(items=rows[offset:offset+50],hasMore=len(rows)>offset+50,offset=offset,scope=scope)
    from neo4j import Query
    group='codex-global' if scope=='global' else 'codex-pinned'
    with driver.session(database=driver.database_name,default_access_mode='READ') as s:
        rows=s.run(Query('''MATCH(n) WHERE n.group_id=$group AND
($q='' OR toLower(coalesce(n.name,n.display_name,'')) CONTAINS toLower($q))
RETURN n.uuid AS uuid,coalesce(n.display_name,n.name,'Без названия') AS name,labels(n) AS labels,
n.created_at AS created ORDER BY name,uuid SKIP $offset LIMIT 51''',timeout=6),group=group,q=q,offset=offset).data()
    return dict(items=rows[:50],hasMore=len(rows)>50,offset=offset,scope=scope)


def neighbors(driver,scope,uuid):
    if driver is None:
        data=snapshot(None,scope); nodes={n['id']:n for n in data['nodes']}; rows=[]
        for e in data['edges']:
            if uuid not in (e['source'],e['target']): continue
            outgoing=e['source']==uuid; n=nodes[e['target'] if outgoing else e['source']]
            rows.append(dict(id=e['id'],type=e['type'],label=e['label'],name=n['name'],uuid=n['uuid'],outgoing=outgoing,invalidAt=None))
        return dict(items=rows,truncated=False)
    from neo4j import Query
    group='codex-global' if scope=='global' else 'codex-pinned'
    with driver.session(database=driver.database_name,default_access_mode='READ') as s:
        rows=s.run(Query('''MATCH(a)-[r]-(b) WHERE a.uuid=$uuid AND a.group_id=$group AND b.group_id=$group
RETURN coalesce(r.uuid,elementId(r)) AS id,type(r) AS type,coalesce(r.name,type(r)) AS label,
coalesce(b.display_name,b.name,'Без названия') AS name,b.uuid AS uuid,
startNode(r)=a AS outgoing,r.invalid_at AS invalidAt ORDER BY name LIMIT 1001''',timeout=6),uuid=uuid,group=group).data()
    return dict(items=rows[:1000],truncated=len(rows)>1000)


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass  # Never log memory queries or user content.

    def reply(self,status,payload,ctype='application/json; charset=utf-8'):
        body=json.dumps(payload,ensure_ascii=False,default=str).encode() if not isinstance(payload,bytes) else payload
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
        self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        allowed={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
        if self.headers.get('Host') not in allowed:
            return self.reply(403,{'error':'Недопустимый адрес запроса'})
        origin=self.headers.get('Origin')
        if origin and origin not in {'http://'+x for x in allowed}:
            return self.reply(403,{'error':'Межсайтовый доступ запрещён'})
        if self.headers.get('Sec-Fetch-Site')=='cross-site':
            return self.reply(403,{'error':'Межсайтовый доступ запрещён'})
        parts=urlsplit(self.path); args=parse_qs(parts.query); scope=args.get('scope',['pinned'])[0]
        if scope not in ('pinned','global'):
            return self.reply(400,{'error':'Неизвестный слой памяти'})
        try:
            if parts.path=='/api/snapshot':
                return self.reply(200,snapshot(self.server.driver,scope))
            if parts.path=='/api/memory':
                offset=max(0,min(100000,int(args.get('offset',['0'])[0])))
                return self.reply(200,memory_search(self.server.driver,scope,args.get('q',[''])[0][:200],offset))
            if parts.path=='/api/neighbors':
                return self.reply(200,neighbors(self.server.driver,scope,args.get('uuid',[''])[0][:200]))
            if parts.path.startswith('/api/'):
                return self.reply(404,{'error':'Нет такого метода'})
            rel='index.html' if parts.path=='/' else parts.path.lstrip('/')
            root=(HERE/'dist').resolve(); target=(root/rel).resolve()
            if not target.is_relative_to(root) or not target.is_file():
                return self.reply(404,{'error':'Файл не найден'})
            # Windows file associations may label .js as text/plain. Modules and
            # nosniff require a stable MIME type independent of registry settings.
            web_types={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8'}
            ctype=web_types.get(target.suffix.lower()) or mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
            return self.reply(200,target.read_bytes(),ctype)
        except (ValueError,TypeError):
            return self.reply(400,{'error':'Некорректные параметры'})
        except Exception:
            return self.reply(503,{'error':'Источник недоступен. Повторите обновление; данные не изменены.'})


def main():
    global REGISTRY,PINS
    ap=argparse.ArgumentParser(description='Brain Console: fictional demo by default; optional explicit live mode')
    ap.add_argument('--port',type=int,default=8770)
    ap.add_argument('--live',action='store_true')
    ap.add_argument('--registry',type=Path)
    ap.add_argument('--pins',type=Path)
    args=ap.parse_args(); driver=None
    if args.live:
        if not args.registry or not args.registry.is_file(): ap.error('--live requires an existing --registry file')
        if not os.environ.get('NEO4J_PASSWORD'): ap.error('Set NEO4J_PASSWORD in the environment; do not commit it')
        from neo4j import GraphDatabase
        REGISTRY=args.registry; PINS=args.pins
        driver=GraphDatabase.driver(os.environ.get('NEO4J_URI','bolt://127.0.0.1:7687'),auth=(os.environ.get('NEO4J_USER','neo4j'),os.environ['NEO4J_PASSWORD']),connection_timeout=4,max_connection_pool_size=4)
        driver.database_name=os.environ.get('NEO4J_DATABASE','neo4j')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler); server.daemon_threads=True; server.driver=driver
    print(f'Brain console http://127.0.0.1:{args.port}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        server.server_close()
        if driver: driver.close()


if __name__=='__main__': main()
