"""Read-only readiness check. Never prints credentials or registry contents."""
import argparse
import json
import os
from pathlib import Path

def check_registry(path):
    data=json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(data,dict) or not isinstance(data.get('personas'),dict):
        raise ValueError('Registry requires a personas object')
    personas=data['personas']
    for key,p in personas.items():
        if not isinstance(key,str) or not key or not isinstance(p,dict): raise ValueError('Invalid profile')
        if not isinstance(p.get('name'),str) or not p['name'].strip(): raise ValueError('Profile requires a name')
        if not isinstance(p.get('capabilities',[]),list) or any(not isinstance(x,str) for x in p.get('capabilities',[])): raise ValueError('Capabilities must be strings')
    routes=data.get('verified_collaboration_routes',{}).get('routes',{})
    if not isinstance(routes,dict): raise ValueError('Routes must be an object')
    orphan=sum(1 for r in routes.values() if not isinstance(r,dict) or r.get('source_thread_id') not in personas or r.get('target_thread_id') not in personas)
    return {'registry_valid':True,'profiles':len(personas),'routes':len(routes),'orphan_routes':orphan,'empty':not personas}

def check_neo4j():
    from neo4j import GraphDatabase,Query
    if not os.environ.get('NEO4J_PASSWORD'): raise ValueError('Missing password')
    with GraphDatabase.driver(os.environ.get('NEO4J_URI','bolt://127.0.0.1:7687'),auth=(os.environ.get('NEO4J_USER','neo4j'),os.environ['NEO4J_PASSWORD']),connection_timeout=5,max_transaction_retry_time=0) as driver:
        with driver.session(database=os.environ.get('NEO4J_DATABASE','neo4j'),default_access_mode='READ') as session:
            counts={}
            for group in ['codex-pinned','codex-global']:
                counts[group]=session.run(Query('MATCH(n) WHERE n.group_id=$group RETURN count(n) AS count',timeout=5),group=group).single()['count']
    return {'neo4j_readable':True,'group_counts':counts,'writes_tested':False,'semantic_search_tested':False}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry',type=Path,required=True); parser.add_argument('--neo4j',action='store_true')
    args=parser.parse_args()
    try: result=check_registry(args.registry)
    except Exception:
        print(json.dumps({'ok':False,'stage':'registry','hint':'Check file, JSON schema and profile fields; contents are not printed.'}));return 1
    if args.neo4j:
        try: result.update(check_neo4j())
        except Exception:
            print(json.dumps({'ok':False,'stage':'neo4j','hint':'Check driver installation, credentials, address, database and read permission.'}));return 1
    result['ok']=result['orphan_routes']==0
    print(json.dumps(result,ensure_ascii=False))
    return 0 if result['ok'] else 1

if __name__=='__main__': raise SystemExit(main())
