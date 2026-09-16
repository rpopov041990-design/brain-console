"""Entirely fictional data. No home-directory reads and no network access."""
import hashlib
import json
from datetime import datetime, timezone

def demo_snapshot(scope):
    nodes=[]; edges=[]
    def node(id,name,kind,**kw):
        nodes.append(dict(id=id,uuid=id,name=name,kind=kind,sources=['Демо'],inGraph=True,**kw))
    def edge(a,b,label,type='DEMO_LINK'):
        edges.append(dict(id=f'{a}:{b}:{type}',source=a,target=b,label=label,type=type,sources=['Демо']))
    if scope=='pinned':
        for id,name in [('team:engineering','Инженерия'),('team:creative','Творчество'),('team:review','Контроль')]: node(id,name,'TaskTeam')
        people=[('a','Альта','Архитектор','engineering',['Системный дизайн','Интеграции']),('b','Блик','Дизайнер','creative',['Визуальный стиль','Композиция']),('c','Контур','Разработчик','engineering',['Интерфейсы','Тестирование']),('d','Лира','Редактор','creative',['Тексты','Проверка источников']),('e','Такт','Координатор','review',['Планирование']),('f','Эталон','Рецензент','review',['Контроль качества'])]
        teams={'engineering':'Инженерия','creative':'Творчество','review':'Контроль'}
        for id,name,role,team,caps in people:
            aid='agent:'+id
            node(aid,name,'TaskPersona',role=role,team=teams[team],project='Учебная команда',pinned=True,traits=['Вымышленный демонстрационный профиль'],capabilities=caps,execution={'default_priority':'P2','default_thinking':'medium'})
            edge(aid,'team:'+team,'Состоит в команде','MEMBER_OF')
            for i,cap in enumerate(caps):
                cid=f'skill:{id}{i}';node(cid,cap,'TaskCapability');edge(aid,cid,'Применяет навык','HAS_CAPABILITY')
        for a,b,label in [('a','c','Согласует архитектуру'),('b','c','Передаёт макет'),('d','b','Готовит текст'),('e','a','Координирует'),('f','c','Проверяет результат')]: edge('agent:'+a,'agent:'+b,label)
    else:
        for id,name,kind in [('root','Развитие учебной команды','EvolutionRoot'),('quality','Качество результата','ImprovementArea'),('lesson','Проверять результат перед передачей','LearnedLesson'),('test','Демонстрационная проверка','LessonEvaluation'),('skill','Повторяемая проверка','ReusableSkill')]: node(id,name,kind,status='Демонстрация — не реальная оценка')
        for a,b,label in [('root','quality','Направление'),('quality','lesson','Урок'),('lesson','test','Проверка'),('lesson','skill','Повторное применение')]: edge(a,b,label)
    data=dict(scope=scope,nodes=nodes,edges=edges,registryCount=6 if scope=='pinned' else 0,graphNodeCount=0,graphAvailable=True,truncated=False,supervisor='Такт',reviewer='Эталон',demo=True,pollSeconds=30)
    data['version']=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    data['fetchedAt']=datetime.now(timezone.utc).isoformat()
    return data
